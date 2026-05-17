"use client";

type MidnightProofBadgeProps = {
  midnightTxHash: string | null;
  midnightStatus?: string;
};

export function MidnightProofBadge({ midnightTxHash, midnightStatus }: MidnightProofBadgeProps) {
  if (!midnightTxHash) {
    return (
      <span className="midnight-proof-badge midnight-proof-badge--pending">
        Anchoring to Midnight…
      </span>
    );
  }

  const shortHash = `${midnightTxHash.slice(0, 10)}…${midnightTxHash.slice(-6)}`;

  return (
    <a
      className="midnight-proof-badge midnight-proof-badge--confirmed"
      href={`https://explorer.testnet.midnight.network/tx/${midnightTxHash}`}
      target="_blank"
      rel="noreferrer"
      title={midnightStatus ?? "confirmed"}
    >
      Verified on Midnight Network 🔗 {shortHash}
    </a>
  );
}