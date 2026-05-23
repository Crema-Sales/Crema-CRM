// Adjective + noun banks for combinatorial naming. Two ~30-word arrays mean
// ~900 unique two-word combinations — enough to keep the demo data feeling
// varied even when minting hundreds of orgs/companies/products at once.
export const ADJECTIVES: readonly string[] = [
  "Apex", "Bright", "Coastal", "Daring", "Eager", "Fresh", "Golden", "Heritage",
  "Iron", "Jagged", "Keen", "Lucid", "Modern", "Noble", "Orbital", "Prime",
  "Quartz", "Rapid", "Steady", "Tidal", "Unified", "Velvet", "Wild", "Zen",
  "Archive", "Boreal", "Civic", "Drift", "Ember", "Fjord",
];

export const NOUNS: readonly string[] = [
  "Labs", "Works", "Forge", "Studio", "Group", "Holdings", "Partners",
  "Collective", "Ventures", "Industries", "Systems", "Dynamics", "Logic",
  "Foundry", "Atlas", "Compass", "Beacon", "Harbor", "Summit", "Ridge",
  "Hollow", "Junction", "District", "Pavilion", "Reserve", "Press", "Yard",
  "Bureau", "Society", "Network",
];

// Cities for note flavor.
export const CITIES: readonly string[] = [
  "Austin", "Boston", "Brooklyn", "Charleston", "Chicago", "Denver", "Detroit",
  "Madison", "Minneapolis", "Nashville", "Oakland", "Portland", "Raleigh",
  "San Diego", "Seattle", "Berlin", "Lisbon", "Stockholm", "Amsterdam",
  "Toronto", "Montreal", "Mexico City", "Bogotá", "Buenos Aires", "São Paulo",
  "Singapore", "Tokyo", "Seoul", "Tel Aviv", "Bangalore",
];

// Note snippets — short phrases the generator stitches together for the
// `notes` field on companies / contacts so the CRM doesn't look empty.
export const NOTE_FRAGMENTS: readonly string[] = [
  "Met at SaaStr.", "Intro from a mutual investor.", "Following up after webinar.",
  "Engaged with pricing page three times last week.", "Champion on the buying committee.",
  "Decision pending procurement review.", "Budget cycle starts Q2.",
  "Currently using a competitor — contract renews next quarter.",
  "Asked for an ROI doc.", "Sent the security questionnaire.",
  "Looped in finance.", "Looped in legal.", "Loves the product, blocked on integrations.",
  "Will reconvene after their fiscal close.", "Strong technical fit.",
  "Lukewarm — keep nurturing.", "Hot — close target this month.",
  "Multi-stakeholder deal.", "Single decision-maker, fast cycle.",
  "Open to a paid pilot.",
];

export const COMPANY_SUFFIXES: readonly string[] = [
  "", "", "", "", "Inc.", "LLC", "Co.", "Group", "Holdings", "& Sons",
];
