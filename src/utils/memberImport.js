// Parse a CSV member list into People records
export function parseMemberCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header — handle common column names
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  // Map columns to our fields
  const colMap = {};
  header.forEach((h, i) => {
    if (['name', 'full name', 'member name'].includes(h)) colMap.name = i;
    if (['phone', 'phone number', 'cell', 'mobile'].includes(h)) colMap.phone = i;
    if (['email', 'email address'].includes(h)) colMap.email = i;
    if (['household', 'household name', 'family'].includes(h)) colMap.householdName = i;
    if (['type', 'member type'].includes(h)) colMap.memberType = i;
    if (['address', 'street address'].includes(h)) colMap.address = i;
  });

  if (colMap.name === undefined) {
    // If no name column found, try first column
    colMap.name = 0;
  }

  const members = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const name = cols[colMap.name]?.trim();
    if (!name) continue;

    members.push({
      name,
      phone: colMap.phone !== undefined ? cols[colMap.phone]?.trim() || '' : '',
      email: colMap.email !== undefined ? cols[colMap.email]?.trim() || '' : '',
      householdName: colMap.householdName !== undefined ? cols[colMap.householdName]?.trim() || '' : '',
      memberType: colMap.memberType !== undefined ? cols[colMap.memberType]?.trim() || '' : '',
      address: colMap.address !== undefined ? cols[colMap.address]?.trim() || '' : '',
    });
  }

  return members;
}

// Parse a single CSV line respecting quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// Diff an imported member list against existing People records
export function diffMemberList(imported, existing) {
  const existingByName = {};
  for (const p of existing) {
    existingByName[p.name.toLowerCase()] = p;
  }

  const importedNames = new Set();
  const newMembers = [];
  const updatedMembers = [];

  for (const imp of imported) {
    const key = imp.name.toLowerCase();
    importedNames.add(key);

    const match = existingByName[key];
    if (!match) {
      newMembers.push({ ...imp, moveInDate: new Date().toISOString() });
    } else {
      // Check for updates
      const changes = {};
      if (imp.phone && imp.phone !== match.phone) changes.phone = imp.phone;
      if (imp.email && imp.email !== match.email) changes.email = imp.email;
      if (imp.address && imp.address !== match.address) changes.address = imp.address;
      if (imp.householdName && imp.householdName !== match.householdName) changes.householdName = imp.householdName;

      if (Object.keys(changes).length > 0) {
        updatedMembers.push({ existing: match, changes });
      }
    }
  }

  // Departed: in existing but not in import
  const departed = existing.filter(p => !importedNames.has(p.name.toLowerCase()));

  return { newMembers, updatedMembers, departed };
}

// Apply approved changes from the diff
export async function applyMemberImport(diff, approvals, db) {
  const { addNew, updateExisting, removeDeparted } = approvals;

  if (addNew && diff.newMembers.length > 0) {
    for (const m of diff.newMembers) {
      await db.people.add({
        name: m.name,
        phone: m.phone || '',
        email: m.email || '',
        householdName: m.householdName || '',
        memberType: m.memberType || '',
        address: m.address || '',
        moveInDate: m.moveInDate || new Date().toISOString(),
        isMinisterEligible: true,
      });
    }
  }

  if (updateExisting && diff.updatedMembers.length > 0) {
    for (const { existing, changes } of diff.updatedMembers) {
      await db.people.update(existing.id, changes);
    }
  }

  if (removeDeparted && diff.departed.length > 0) {
    for (const p of diff.departed) {
      await db.people.update(p.id, {
        moveOutDate: new Date().toISOString(),
      });
    }
  }
}
