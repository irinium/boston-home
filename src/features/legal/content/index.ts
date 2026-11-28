import type { LegalLibrary } from '../domain/documents';

import { privacy } from './privacy';
import { terms } from './terms';

export const LEGAL_LIBRARY: LegalLibrary = { privacy, terms };
