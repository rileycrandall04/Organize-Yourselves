// Calling configurations derived from the General Handbook
// Each calling includes default responsibilities, meetings, and relationships

export const MEETING_CADENCES = {
  weekly: 'Weekly',
  biweekly: 'Every other week',
  first_sunday: '1st Sunday',
  second_sunday: '2nd Sunday',
  third_sunday: '3rd Sunday',
  fourth_sunday: '4th Sunday',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  biannual: 'Twice yearly',
  annual: 'Annually',
  as_needed: 'As needed',
};

export const ORGANIZATIONS = [
  { key: 'bishopric', label: 'Bishopric' },
  { key: 'elders_quorum', label: 'Elders Quorum' },
  { key: 'relief_society', label: 'Relief Society' },
  { key: 'young_women', label: 'Young Women' },
  { key: 'young_men', label: 'Young Men / Aaronic Priesthood' },
  { key: 'primary', label: 'Primary' },
  { key: 'sunday_school', label: 'Sunday School' },
  { key: 'missionary', label: 'Missionary' },
  { key: 'temple_fh', label: 'Temple & Family History' },
  { key: 'music', label: 'Music' },
  { key: 'stake', label: 'Stake' },
  { key: 'other', label: 'Other' },
];

export const CALLING_STATUS_FLOW = [
  { key: 'identified', label: 'Identified', color: 'gray' },
  { key: 'prayed_about', label: 'Prayed About', color: 'blue' },
  { key: 'discussed', label: 'Discussed in Bishopric', color: 'indigo' },
  { key: 'extended', label: 'Extended', color: 'yellow' },
  { key: 'accepted', label: 'Accepted', color: 'emerald' },
  { key: 'declined', label: 'Declined', color: 'red' },
  { key: 'sustained', label: 'Sustained', color: 'teal' },
  { key: 'set_apart', label: 'Set Apart', color: 'green' },
  { key: 'released', label: 'Released', color: 'gray' },
];

// ── Calling Definitions ──────────────────────────────────────

export const CALLINGS = {
  // ── BISHOPRIC ────────────────────────────────────────────
  bishop: {
    key: 'bishop',
    title: 'Bishop',
    organization: 'bishopric',
    handbook: 'Chapter 7',
    reportsTo: 'Stake President',
    responsibilities: [
      { title: 'Preside over the ward as presiding high priest', handbook: '7.1.1' },
      { title: 'Serve as president of the Aaronic Priesthood', handbook: '7.1.2' },
      { title: 'Serve as common judge — conduct worthiness interviews', handbook: '7.1.3' },
      { title: 'Coordinate God\'s work of salvation and exaltation', handbook: '7.1.4' },
      { title: 'Oversee callings and releases', handbook: '30' },
      { title: 'Oversee records, finances, and the meetinghouse', handbook: '7.1.5' },
      { title: 'Assign stewardship of organizations to counselors' },
      { title: 'Conduct temple recommend interviews', handbook: '26' },
      { title: 'Oversee fast offerings and temporal welfare', handbook: '22' },
    ],
    meetings: [
      { name: 'Bishopric Meeting', cadence: 'weekly', handbook: '29.2.4',
        agendaTemplate: ['Opening prayer', 'Spiritual thought', 'Follow-up on action items', 'Callings and releases', 'Youth matters', 'Ordinance preparation', 'Ward budget and finances', 'Plans for upcoming meetings/activities', 'Closing prayer'] },
      { name: 'Ward Council', cadence: 'weekly', handbook: '29.2.5',
        agendaTemplate: ['Opening prayer', 'Spiritual thought / training', 'Follow-up on action items', 'Ministering and member needs', 'Missionary and convert retention', 'Temple and family history', 'Youth and activities', 'Other business', 'Closing prayer'] },
      { name: 'Ward Youth Council', cadence: 'monthly', handbook: '29.2.6',
        agendaTemplate: ['Opening prayer', 'Spiritual thought', 'Follow-up on action items', 'Youth needs and concerns', 'Activity planning', 'Ministering discussion', 'Other business', 'Closing prayer'] },
      { name: 'Sacrament Meeting', cadence: 'weekly', handbook: '29.2.1',
        agendaTemplate: ['Presiding', 'Conducting', 'Announcements', 'Opening hymn', 'Invocation', 'Ward business', 'Sacrament hymn', 'Sacrament', 'Speaker 1', 'Intermediate hymn', 'Speaker 2', 'Closing hymn', 'Benediction'] },
      { name: 'Stake Bishops\' Council', cadence: 'quarterly', handbook: '29.3.10',
        agendaTemplate: ['Instruction from stake president', 'Discussion items', 'Action items'] },
      { name: 'Stake Conference', cadence: 'biannual', handbook: '29.3.1', agendaTemplate: [] },
      { name: 'Ward Conference', cadence: 'annual', handbook: '29.2.3', agendaTemplate: [] },
      { name: 'Quarterly Meeting with EQ & RS Presidents', cadence: 'quarterly', handbook: '7.1.4',
        agendaTemplate: ['Opening prayer', 'Member needs review', 'Ministering updates', 'Temporal welfare concerns', 'Coordination items', 'Closing prayer'] },
    ],
  },

  bishopric_1st: {
    key: 'bishopric_1st',
    title: 'Bishopric 1st Counselor',
    organization: 'bishopric',
    handbook: 'Chapter 7',
    reportsTo: 'Bishop',
    responsibilities: [
      { title: 'Support the bishop in all responsibilities' },
      { title: 'Oversee assigned organizations (configured by bishop)' },
      { title: 'Extend callings when delegated by bishop' },
      { title: 'Conduct meetings when assigned' },
      { title: 'Conduct temple recommend interviews (when assigned)' },
    ],
    meetings: [
      { name: 'Bishopric Meeting', cadence: 'weekly', handbook: '29.2.4', agendaTemplate: [] },
      { name: 'Ward Council', cadence: 'weekly', handbook: '29.2.5', agendaTemplate: [] },
      { name: 'Ward Youth Council', cadence: 'monthly', handbook: '29.2.6', agendaTemplate: [] },
      { name: 'Sacrament Meeting', cadence: 'weekly', handbook: '29.2.1', agendaTemplate: [] },
    ],
  },

  bishopric_2nd: {
    key: 'bishopric_2nd',
    title: 'Bishopric 2nd Counselor',
    organization: 'bishopric',
    handbook: 'Chapter 7',
    reportsTo: 'Bishop',
    responsibilities: [
      { title: 'Support the bishop in all responsibilities' },
      { title: 'Oversee assigned organizations (configured by bishop)' },
      { title: 'Extend callings when delegated by bishop' },
      { title: 'Conduct meetings when assigned' },
      { title: 'Conduct temple recommend interviews (when assigned)' },
    ],
    meetings: [
      { name: 'Bishopric Meeting', cadence: 'weekly', handbook: '29.2.4', agendaTemplate: [] },
      { name: 'Ward Council', cadence: 'weekly', handbook: '29.2.5', agendaTemplate: [] },
      { name: 'Ward Youth Council', cadence: 'monthly', handbook: '29.2.6', agendaTemplate: [] },
      { name: 'Sacrament Meeting', cadence: 'weekly', handbook: '29.2.1', agendaTemplate: [] },
    ],
  },

  exec_secretary: {
    key: 'exec_secretary',
    title: 'Ward Executive Secretary',
    organization: 'bishopric',
    handbook: '7.3',
    reportsTo: 'Bishop',
    responsibilities: [
      { title: 'Schedule appointments for the bishop' },
      { title: 'Attend and take notes in bishopric meetings' },
      { title: 'Attend and take notes in ward council meetings' },
      { title: 'Follow up on assignments from bishopric' },
      { title: 'Help coordinate ward calendar' },
      { title: 'Schedule temple recommend renewal interviews' },
      { title: 'Help coordinate member records and military personnel tracking' },
    ],
    meetings: [
      { name: 'Bishopric Meeting', cadence: 'weekly', handbook: '29.2.4', agendaTemplate: [] },
      { name: 'Ward Council', cadence: 'weekly', handbook: '29.2.5', agendaTemplate: [] },
    ],
  },

  // ── WARD CLERK ─────────────────────────────────────────────
  ward_clerk: {
    key: 'ward_clerk',
    title: 'Ward Clerk',
    organization: 'bishopric',
    handbook: '7.4',
    reportsTo: 'Bishop',
    responsibilities: [
      { title: 'Prepare and maintain ward records and reports', handbook: '7.4' },
      { title: 'Process membership records and ordinance certificates', handbook: '33.6' },
      { title: 'Manage ward financial records and budget tracking', handbook: '34.6' },
      { title: 'Support tithing declaration process' },
      { title: 'Prepare reports as directed by the bishop' },
    ],
    meetings: [
      { name: 'Bishopric Meeting', cadence: 'weekly', handbook: '29.2.4', agendaTemplate: [] },
      { name: 'Ward Council', cadence: 'weekly', handbook: '29.2.5', agendaTemplate: [] },
    ],
  },

  // ── ELDERS QUORUM ────────────────────────────────────────
  eq_president: {
    key: 'eq_president',
    title: 'Elders Quorum President',
    organization: 'elders_quorum',
    handbook: 'Chapter 8',
    reportsTo: 'Stake President (via high councilor) & Bishop for ward work',
    responsibilities: [
      { title: 'Lead the quorum in God\'s work of salvation and exaltation', handbook: '8.3.3' },
      { title: 'Oversee ministering assignments and interviews', handbook: '21' },
      { title: 'Coordinate service and moving assistance' },
      { title: 'Support missionary work — new and returning members', handbook: '23' },
      { title: 'Support temple and family history efforts', handbook: '25' },
      { title: 'Teach and strengthen quorum members' },
      { title: 'Help prospective elders prepare for ordination', handbook: '8.4' },
    ],
    meetings: [
      { name: 'EQ Presidency Meeting', cadence: 'weekly', handbook: '8.3.3',
        agendaTemplate: ['Opening prayer', 'Spiritual thought', 'Follow-up on action items', 'Ministering updates', 'Member needs', 'Quorum meeting planning', 'Missionary / temple work', 'Other items', 'Closing prayer'] },
      { name: 'Ward Council', cadence: 'weekly', handbook: '29.2.5', agendaTemplate: [] },
      { name: 'Extended EQ Presidency', cadence: 'as_needed',
        agendaTemplate: ['Opening prayer', 'Training', 'Follow-up items', 'Ministering discussion', 'Planning', 'Closing prayer'] },
      { name: 'Stake Priesthood Leadership', cadence: 'biannual', handbook: '29.3.3', agendaTemplate: [] },
    ],
  },

  // ── RELIEF SOCIETY ───────────────────────────────────────
  rs_president: {
    key: 'rs_president',
    title: 'Relief Society President',
    organization: 'relief_society',
    handbook: 'Chapter 9',
    reportsTo: 'Bishop',
    responsibilities: [
      { title: 'Lead Relief Society in God\'s work of salvation and exaltation', handbook: '9.3.2' },
      { title: 'Oversee ministering assignments and interviews', handbook: '21' },
      { title: 'Coordinate compassionate service' },
      { title: 'Support missionary work — new and returning members', handbook: '23' },
      { title: 'Support temple and family history efforts', handbook: '25' },
      { title: 'Strengthen sisters through gospel teaching' },
      { title: 'Help with self-reliance and temporal needs', handbook: '22' },
    ],
    meetings: [
      { name: 'RS Presidency Meeting', cadence: 'weekly', handbook: '9.3.2',
        agendaTemplate: ['Opening prayer', 'Spiritual thought', 'Follow-up on action items', 'Ministering updates', 'Sister needs / compassionate service', 'Meeting and activity planning', 'Missionary / temple work', 'Closing prayer'] },
      { name: 'Ward Council', cadence: 'weekly', handbook: '29.2.5', agendaTemplate: [] },
      { name: 'Stake RS Leadership', cadence: 'annual', handbook: '29.3.4', agendaTemplate: [] },
    ],
  },

  // ── WARD MISSION LEADER ──────────────────────────────────
  ward_mission_leader: {
    key: 'ward_mission_leader',
    title: 'Ward Mission Leader',
    organization: 'missionary',
    handbook: '23.5.3',
    reportsTo: 'Bishop',
    responsibilities: [
      { title: 'Coordinate ward missionary efforts with full-time missionaries', handbook: '23.5.3' },
      { title: 'Conduct weekly missionary coordination meetings', handbook: '23.4' },
      { title: 'Support new and returning members — integration and fellowship' },
      { title: 'Help ward council develop and maintain ward mission plan', handbook: '23.5.6' },
      { title: 'Track Covenant Path Progress for those being taught', handbook: '23.4.1' },
      { title: 'Coordinate member-missionary activities and events' },
      { title: 'Report to stake on missionary efforts' },
    ],
    meetings: [
      { name: 'Missionary Coordination Meeting', cadence: 'weekly', handbook: '23.4',
        agendaTemplate: ['Opening prayer', 'Follow-up on action items', 'Covenant Path Progress review', 'People being taught — updates', 'New member support — updates', 'Returning member support — updates', 'Member missionary efforts', 'Assignments for the week', 'Closing prayer'] },
      { name: 'Ward Council', cadence: 'weekly', handbook: '29.2.5', agendaTemplate: [] },
      { name: 'Stake Missionary Correlation', cadence: 'monthly', 
        agendaTemplate: ['Stake direction and goals', 'Ward reports', 'Best practices sharing', 'Action items'] },
      { name: 'Extended EQ Presidency (when invited)', cadence: 'as_needed', agendaTemplate: [] },
    ],
  },

  // ── YOUNG WOMEN ──────────────────────────────────────────
  yw_president: {
    key: 'yw_president',
    title: 'Young Women President',
    organization: 'young_women',
    handbook: 'Chapter 11',
    reportsTo: 'Bishop',
    responsibilities: [
      { title: 'Strengthen young women and help them progress on the covenant path', handbook: '11.3.2' },
      { title: 'Organize and oversee Young Women classes' },
      { title: 'Plan activities including camps and service projects' },
      { title: 'Support young women in Children and Youth program' },
      { title: 'Help young women prepare for Relief Society transition' },
      { title: 'Support missionary and temple work among youth' },
    ],
    meetings: [
      { name: 'YW Presidency Meeting', cadence: 'weekly',
        agendaTemplate: ['Opening prayer', 'Spiritual thought', 'Follow-up on action items', 'Young women needs', 'Class and activity planning', 'Children and Youth updates', 'Closing prayer'] },
      { name: 'Ward Youth Council', cadence: 'monthly', handbook: '29.2.6', agendaTemplate: [] },
      { name: 'Ward Council (when invited)', cadence: 'weekly', agendaTemplate: [] },
      { name: 'Stake YW Leadership', cadence: 'annual', handbook: '29.3.4', agendaTemplate: [] },
    ],
  },

  // ── PRIMARY ──────────────────────────────────────────────
  primary_president: {
    key: 'primary_president',
    title: 'Primary President',
    organization: 'primary',
    handbook: 'Chapter 12',
    reportsTo: 'Bishop',
    responsibilities: [
      { title: 'Organize and oversee Primary classes and nursery', handbook: '12.3.2' },
      { title: 'Support children in learning the gospel' },
      { title: 'Plan the annual sacrament meeting children\'s presentation', handbook: '12.1.6' },
      { title: 'Oversee Primary music program' },
      { title: 'Coordinate with parents to support children' },
      { title: 'Help prepare children for baptism (age 8)' },
      { title: 'Attend missionary coordination meetings', handbook: '23.4' },
    ],
    meetings: [
      { name: 'Primary Presidency Meeting', cadence: 'weekly',
        agendaTemplate: ['Opening prayer', 'Spiritual thought', 'Follow-up on action items', 'Children needs', 'Teacher coordination', 'Music program', 'Activity planning', 'Closing prayer'] },
      { name: 'Ward Council (when invited)', cadence: 'weekly', agendaTemplate: [] },
      { name: 'Stake Primary Leadership', cadence: 'annual', handbook: '29.3.4', agendaTemplate: [] },
    ],
  },

  // ── SUNDAY SCHOOL ────────────────────────────────────────
  ss_president: {
    key: 'ss_president',
    title: 'Sunday School President',
    organization: 'sunday_school',
    handbook: 'Chapter 13',
    reportsTo: 'Bishop',
    responsibilities: [
      { title: 'Support gospel teaching in the ward', handbook: '13.2.2' },
      { title: 'Organize teacher council meetings', handbook: '17.4' },
      { title: 'Coordinate class assignments and curriculum' },
      { title: 'Organize classes for new members and investigators' },
    ],
    meetings: [
      { name: 'SS Presidency Meeting', cadence: 'as_needed',
        agendaTemplate: ['Opening prayer', 'Follow-up items', 'Teacher needs', 'Class organization', 'Curriculum planning', 'Closing prayer'] },
      { name: 'Teacher Council Meeting', cadence: 'quarterly', handbook: '17.4', agendaTemplate: [] },
      { name: 'Ward Council (when invited)', cadence: 'weekly', agendaTemplate: [] },
      { name: 'Stake SS Leadership', cadence: 'annual', handbook: '29.3.4', agendaTemplate: [] },
    ],
  },

  // ── TEMPLE & FAMILY HISTORY LEADER ───────────────────────
  temple_fh_leader: {
    key: 'temple_fh_leader',
    title: 'Ward Temple & Family History Leader',
    organization: 'temple_fh',
    handbook: '25.2.3',
    reportsTo: 'EQ President',
    responsibilities: [
      { title: 'Coordinate temple and family history efforts in the ward', handbook: '25.2.3' },
      { title: 'Help members prepare to receive temple ordinances' },
      { title: 'Organize family history consultants' },
      { title: 'Support temple and family history coordination meetings', handbook: '25.2.7' },
    ],
    meetings: [
      { name: 'Temple & FH Coordination Meeting', cadence: 'as_needed', handbook: '25.2.7',
        agendaTemplate: ['Opening prayer', 'Temple prep progress', 'Family history efforts', 'Upcoming temple trips', 'Consultant assignments', 'Closing prayer'] },
      { name: 'Ward Council (when invited)', cadence: 'as_needed', agendaTemplate: [] },
    ],
  },

  // ── STAKE CALLINGS ───────────────────────────────────────
  stake_president: {
    key: 'stake_president',
    title: 'Stake President',
    organization: 'stake',
    handbook: 'Chapter 6',
    reportsTo: 'Area Seventy',
    responsibilities: [
      { title: 'Preside over the stake as presiding high priest', handbook: '6.2.1' },
      { title: 'Lead God\'s work of salvation and exaltation in the stake', handbook: '6.2.2' },
      { title: 'Serve as common judge', handbook: '6.2.3' },
      { title: 'Oversee records, finances, and properties', handbook: '6.2.4' },
      { title: 'Train and support bishops' },
      { title: 'Interview and call bishops and stake leaders' },
      { title: 'Conduct temple recommend interviews' },
    ],
    meetings: [
      { name: 'Stake Presidency Meeting', cadence: 'weekly', handbook: '29.3.5',
        agendaTemplate: ['Opening prayer', 'Spiritual thought', 'Follow-up on action items', 'Ward and stake needs', 'Callings', 'Stake programs and activities', 'Budget', 'Closing prayer'] },
      { name: 'High Council Meeting', cadence: 'biweekly', handbook: '29.3.6', agendaTemplate: [] },
      { name: 'Stake Council Meeting', cadence: 'monthly', handbook: '29.3.7', agendaTemplate: [] },
      { name: 'Stake Bishops\' Council', cadence: 'quarterly', handbook: '29.3.10', agendaTemplate: [] },
      { name: 'Stake Conference', cadence: 'biannual', handbook: '29.3.1', agendaTemplate: [] },
      { name: 'Coordinating Council', cadence: 'quarterly', handbook: '29.4', agendaTemplate: [] },
    ],
  },

  high_councilor: {
    key: 'high_councilor',
    title: 'High Councilor',
    organization: 'stake',
    handbook: '6.5',
    reportsTo: 'Stake President',
    responsibilities: [
      { title: 'Represent the stake presidency in assigned wards', handbook: '6.5.1' },
      { title: 'Serve on stake councils and committees', handbook: '6.5.2' },
      { title: 'Support assigned ward EQ presidencies' },
      { title: 'Instruct and support ward leaders in assigned areas' },
      { title: 'Speak in assigned ward sacrament meetings' },
    ],
    meetings: [
      { name: 'High Council Meeting', cadence: 'biweekly', handbook: '29.3.6', agendaTemplate: [] },
      { name: 'Stake Council Meeting', cadence: 'monthly', handbook: '29.3.7', agendaTemplate: [] },
      { name: 'Stake Conference', cadence: 'biannual', handbook: '29.3.1', agendaTemplate: [] },
      { name: 'Stake Priesthood Leadership', cadence: 'biannual', handbook: '29.3.3', agendaTemplate: [] },
    ],
  },

  stake_1st_counselor: {
    key: 'stake_1st_counselor',
    title: 'Stake Presidency 1st Counselor',
    organization: 'stake',
    handbook: 'Chapter 6',
    reportsTo: 'Stake President',
    responsibilities: [
      { title: 'Support the stake president in all responsibilities' },
      { title: 'Oversee assigned organizations and programs' },
      { title: 'Conduct temple recommend interviews' },
      { title: 'Serve on stake councils' },
      { title: 'Train and support ward leaders' },
    ],
    meetings: [
      { name: 'Stake Presidency Meeting', cadence: 'weekly', handbook: '29.3.5', agendaTemplate: [] },
      { name: 'High Council Meeting', cadence: 'biweekly', handbook: '29.3.6', agendaTemplate: [] },
      { name: 'Stake Council Meeting', cadence: 'monthly', handbook: '29.3.7', agendaTemplate: [] },
      { name: 'Stake Conference', cadence: 'biannual', handbook: '29.3.1', agendaTemplate: [] },
    ],
  },

  stake_2nd_counselor: {
    key: 'stake_2nd_counselor',
    title: 'Stake Presidency 2nd Counselor',
    organization: 'stake',
    handbook: 'Chapter 6',
    reportsTo: 'Stake President',
    responsibilities: [
      { title: 'Support the stake president in all responsibilities' },
      { title: 'Oversee assigned organizations and programs' },
      { title: 'Conduct temple recommend interviews' },
      { title: 'Serve on stake councils' },
      { title: 'Train and support ward leaders' },
    ],
    meetings: [
      { name: 'Stake Presidency Meeting', cadence: 'weekly', handbook: '29.3.5', agendaTemplate: [] },
      { name: 'High Council Meeting', cadence: 'biweekly', handbook: '29.3.6', agendaTemplate: [] },
      { name: 'Stake Council Meeting', cadence: 'monthly', handbook: '29.3.7', agendaTemplate: [] },
      { name: 'Stake Conference', cadence: 'biannual', handbook: '29.3.1', agendaTemplate: [] },
    ],
  },
};

// ── Organization to President Mapping ─────────────────────────
// Maps org keys to the calling key of that org's leader (for counselor assignments)

export const ORG_PRESIDENT_MAP = {
  elders_quorum: 'eq_president',
  relief_society: 'rs_president',
  young_women: 'yw_president',
  primary: 'primary_president',
  sunday_school: 'ss_president',
  missionary: 'ward_mission_leader',
  temple_fh: 'temple_fh_leader',
};

export function getPresidentForOrg(orgKey) {
  return ORG_PRESIDENT_MAP[orgKey] || null;
}

// Helper: Get a flat list for UI selection
export function getCallingList() {
  return Object.values(CALLINGS).map(c => ({
    key: c.key,
    title: c.title,
    organization: c.organization,
    handbook: c.handbook,
  }));
}

// Helper: Get calling by key
export function getCallingConfig(key) {
  return CALLINGS[key] || null;
}

// Helper: Get organization label
export function getOrgLabel(key) {
  return ORGANIZATIONS.find(o => o.key === key)?.label || key;
}

