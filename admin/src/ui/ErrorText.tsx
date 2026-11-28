import type { ModerationErrorCode } from '../domain/errors';
import { useApp } from './AppContext';

export function ErrorText({ code }: { readonly code: ModerationErrorCode | null }) {
  const { t } = useApp();
  if (!code) return null;
  return <p role="alert" className="error">{t(`moderation.errors.${code}`)}</p>;
}
