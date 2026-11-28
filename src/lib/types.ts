// Hand-written until we generate types with `supabase gen types typescript`.

export type AgeBand = '18_24' | '25_34' | '35_44' | '45_54' | '55_plus';
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type ListingStatus = 'draft' | 'active' | 'paused' | 'hidden';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
export type DistanceBand = 'lt_10' | '10_25' | '25_50' | '50_100' | '100_plus';

/** A row from `search_listings`. Photos and coordinates are null for guests and accounts that are not trusted yet. */
export type ListingSummary = {
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
  children_age_bands: string[];
  pets: string[];
  smoking: 'no' | 'outside_only' | 'yes' | null;
  photo_count: number;
  photo_paths: string[] | null;
  approx_lat: number | null;
  approx_lng: number | null;
  distance_band: DistanceBand | null;
  published_at: string;
};

export type SearchFilters = {
  country?: string;
  hasChildren?: boolean;
  noPets?: boolean;
  noSmoking?: boolean;
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

export type ListingDraft = {
  title: string;
  about: string;
  looking_for: string;
  country_code: string;
  city: string;
  has_children: boolean;
  children_count: number;
  photo_paths: string[];
};
