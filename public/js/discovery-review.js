/** Flag rows that appeared or changed direction after a parse fix — for manual review. */

export const DISCOVERY_REVIEW_GROUP = "รายการใหม่ที่ค้นเจอ";

export function txFingerprint(tx) {
  return [
    tx?.date || "",
    tx?.time || "",
    Number(tx?.amount) || 0,
    tx?.balance ?? "",
    String(tx?.raw || "").slice(0, 120),
  ].join("|");
}

export function txLooseKey(tx) {
  return [tx?.date || "", Number(tx?.amount) || 0, tx?.balance ?? ""].join("|");
}

function findPreviousMatch(tx, byFp, byLoose) {
  const hit = byFp.get(txFingerprint(tx));
  if (hit) return hit;
  const bag = byLoose.get(txLooseKey(tx)) || [];
  return (
    bag.find(
      (o) =>
        o.date === tx.date &&
        Math.abs((Number(o.amount) || 0) - (Number(tx.amount) || 0)) < 0.021 &&
        Math.abs((Number(o.balance) || 0) - (Number(tx.balance) || 0)) < 0.021
    ) || null
  );
}

/**
 * Tag money rows that are brand-new vs a previous statement parse, or whose
 * in/out direction flipped. Leaves already-categorized review tags alone.
 * @returns {{ transactions: any[], tagged: number, brandNew: number, dirFlip: number }}
 */
export function tagDiscoveryReview(transactions, previousTransactions = []) {
  const prev = Array.isArray(previousTransactions) ? previousTransactions : [];
  const byFp = new Map(prev.map((t) => [txFingerprint(t), t]));
  const byLoose = new Map();
  for (const t of prev) {
    const k = txLooseKey(t);
    if (!byLoose.has(k)) byLoose.set(k, []);
    byLoose.get(k).push(t);
  }

  let brandNew = 0;
  let dirFlip = 0;
  let tagged = 0;

  const next = transactions.map((tx) => {
    if (!(Number(tx.amount) > 0)) return tx;
    if (String(tx.category || "").trim() === DISCOVERY_REVIEW_GROUP) return tx;

    const old = findPreviousMatch(tx, byFp, byLoose);
    let reason = "";
    if (!old) {
      brandNew += 1;
      reason = "ค้นพบเพิ่มจาก parse ใหม่";
    } else if (old.direction && tx.direction && old.direction !== tx.direction) {
      dirFlip += 1;
      reason = `แก้ทิศทาง ${old.direction}→${tx.direction}`;
    } else {
      return tx;
    }

    tagged += 1;
    const noteBits = [String(tx.note || "").trim(), reason].filter(Boolean);
    return {
      ...tx,
      category: DISCOVERY_REVIEW_GROUP,
      note: noteBits.join(" · "),
      discoveryReview: true,
      discoveryReason: reason,
    };
  });

  return { transactions: next, tagged, brandNew, dirFlip };
}

export function ensureDiscoveryReviewCategory(categories = []) {
  const list = Array.isArray(categories) ? [...categories] : [];
  if (!list.includes(DISCOVERY_REVIEW_GROUP)) list.unshift(DISCOVERY_REVIEW_GROUP);
  return list;
}
