type Props = {
  piiStripped: number;
  piiTransmitted: number;
  note?: string;
};

export function PrivacyBadge({ piiStripped, piiTransmitted, note }: Props) {
  return (
    <div className="privacy-badge">
      <div className="privacy-badge__icon" aria-hidden="true">
        🔒
      </div>
      <div className="privacy-badge__body">
        <div className="privacy-badge__headline">Privacy proof</div>
        <div className="privacy-badge__metric">{piiStripped} PII items stripped</div>
        <div className="privacy-badge__metric privacy-badge__metric--muted">
          {piiTransmitted} transmitted to the LLM
        </div>
        {note ? <div className="privacy-badge__note">{note}</div> : null}
      </div>
    </div>
  );
}
