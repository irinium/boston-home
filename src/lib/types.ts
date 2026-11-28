// Hand-written until we generate types with `supabase gen types typescript`.

export type AgeBand = '18_24' | '25_34' | '35_44' | '45_54' | '55_plus';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type ListingStatus = 'draft' | 'active' | 'paused' | 'hidden';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
export type DistanceBand = 'lt_10' | '10_25' | '25_50' | '50_100' | '100_plus';

/** A row from `search_listings`. Photos and coordinates are null for guests and accounts that are not trusted yet. */
export type ListingSummary = Conditions & {
  id: string;
  title: string;
  about: string;
  looking_for: string;
  country_code: string;
  city: string;
  target_country_code: string | null;
  target_city: string | null;
  age_band: AgeBand | null;
  languages: string[];
  has_children: boolean;
  children_count: number;
  photo_count: number;
  photo_paths: string[] | null;
  approx_lat: number | null;
  approx_lng: number | null;
  distance_band: DistanceBand | null;
  published_at: string;
};

export type PartnerChildren = 'welcome' | 'no_children' | 'any';
export type Smoking = 'no' | 'outside_only' | 'yes';
export type Alcohol = 'no' | 'sometimes' | 'yes';
export type Diet = 'any' | 'vegetarian' | 'vegan';
export type Chronotype = 'early' | 'night' | 'flexible';
export type WorkMode = 'remote' | 'office' | 'shifts' | 'other';
export type LivingArrangement = 'my_place' | 'partner_place' | 'new_place' | 'flexible';
export type Relocation = 'yes' | 'within_country' | 'no';
export type MoveIn = 'asap' | '3_6_months' | '1_year_plus';
export type Expenses = 'equal' | 'proportional' | 'discuss';
export type Pet = 'cat' | 'dog' | 'other';
export type ChildAgeBand = '0_3' | '4_11' | '12_17';
export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled';

/** Household conditions shared by a listing row, the editor draft and search results. */
export type Conditions = {
  children_age_bands: ChildAgeBand[];
  partner_children: PartnerChildren;
  pets: Pet[];
  pet_allergy: boolean;
  smoking: Smoking | null;
  alcohol: Alcohol | null;
  diet: Diet | null;
  chronotype: Chronotype | null;
  work_mode: WorkMode | null;
  living_arrangement: LivingArrangement | null;
  relocation: Relocation | null;
  move_in: MoveIn | null;
  separate_rooms: boolean | null;
  expenses: Expenses | null;
};

export type SearchFilters = {
  country?: string;
  hasChildren?: boolean;
  /** Only listings that welcome a partner with children. */
  iHaveChildren?: boolean;
  noPets?: boolean;
  noSmoking?: boolean;
  ageBands?: AgeBand[];
  languages?: string[];
  living?: LivingArrangement[];
  moveIn?: MoveIn[];
  lat?: number;
  lng?: number;
  radiusKm?: number;
  sort?: 'newest' | 'nearest' | 'age';
  offset?: number;
};

export type MyAccount = {
  id: string;
  display_name: string | null;
  verification_status: VerificationStatus;
  /** May publish and send requests, and sees listing photos and map points. */
  trusted: boolean;
  photo_path: string | null;
  age_band: AgeBand | null;
  languages: string[];
  is_suspended: boolean;
  credits: number;
  has_listing: boolean;
};

export type ConnectionRequest = {
  id: string;
  listing_id: string;
  owner_id: string;
  requester_id: string;
  message: string;
  status: RequestStatus;
  created_at: string;
};

export type ListingDraft = Conditions & {
  title: string;
  about: string;
  looking_for: string;
  country_code: string;
  city: string;
  /** Rough point from the device; the database snaps it to a grid with a fixed offset. */
  approx_lat: number | null;
  approx_lng: number | null;
  target_country_code: string | null;
  target_city: string | null;
  has_children: boolean;
  children_count: number;
  photo_paths: string[];
};

export type ProfileUpdate = {
  display_name: string;
  age_band: AgeBand | null;
  languages: string[];
};

export type AvailabilitySlot = {
  id: string;
  owner_id: string;
  starts_at: string;
  ends_at: string;
};

export type Meeting = {
  id: string;
  request_id: string;
  owner_id: string;
  requester_id: string;
  starts_at: string;
  ends_at: string;
  status: MeetingStatus;
};
