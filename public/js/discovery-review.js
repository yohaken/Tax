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

function indexTxs(list) {
  const byFp = new Map();
  const byLoose = new Map();
  for (const t of list) {
    byFp.set(txFingerprint(t), t);
    const k = txLooseKey(t);
    if (!byLoose.has(k)) byLoose.set(k, []);
    byLoose.get(k).push(t);
  }
  return { byFp, byLoose };
}

/**
 * Tag money rows that are brand-new vs a previous statement parse, or whose
 * in/out direction flipped. Leaves already-categorized review tags alone.
 * @returns {{ transactions: any[], tagged: number, brandNew: number, dirFlip: number }}
 */
export function tagDiscoveryReview(transactions, previousTransactions = []) {
  const prev = Array.isArray(previousTransactions) ? previousTransactions : [];
  const { byFp, byLoose } = indexTxs(prev);

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

/**
 * Merge a corrected bank statement into an existing project WITHOUT wiping user work.
 * - Brand-new rows → “รายการใหม่ที่ค้นเจอ”
 * - Direction/amount fixes on matched rows → update money fields only; keep category/note
 */
export function mergeBundledIntoLocal(localTransactions, bundledTransactions, { makeId } = {}) {
  const local = Array.isArray(localTransactions) ? localTransactions.map((t) => ({ ...t })) : [];
  const bundled = Array.isArray(bundledTransactions) ? bundledTransactions : [];
  const { byFp, byLoose } = indexTxs(local);

  let added = 0;
  let dirFixed = 0;

  for (const b of bundled) {
    const isMoney = Number(b.amount) > 0;
    const isCarry = /ยอดยกมา/i.test(String(b.raw || b.description || ""));
    if (!isMoney && !isCarry) continue;

    const match = findPreviousMatch(b, byFp, byLoose);
    if (!match) {
      const id =
        typeof makeId === "function"
          ? makeId()
          : b.id || `tx_${Math.random().toString(36).slice(2, 10)}`;
      const row = {
        ...b,
        id,
        category: DISCOVERY_REVIEW_GROUP,
        note: [String(b.note || "").trim(), "ค้นพบเพิ่มจาก parse ใหม่"].filter(Boolean).join(" · "),
        discoveryReview: true,
        discoveryReason: "ค้นพบเพิ่มจาก parse ใหม่",
      };
      local.push(row);
      byFp.set(txFingerprint(row), row);
      const k = txLooseKey(row);
      if (!byLoose.has(k)) byLoose.set(k, []);
      byLoose.get(k).push(row);
      if (isMoney) added += 1;
      continue;
    }

    const idx = local.findIndex((t) => t.id === match.id);
    if (idx < 0) continue;

    const cur = local[idx];
    const dirChanged =
      b.direction &&
      b.direction !== "unknown" &&
      cur.direction &&
      cur.direction !== b.direction;
    const amountChanged =
      Math.abs((Number(cur.amount) || 0) - (Number(b.amount) || 0)) > 0.021;
    if (!dirChanged && !amountChanged) continue;

    // Fix ledger fields only — never steal the user's group assignment
    local[idx] = {
      ...cur,
      direction: b.direction || cur.direction,
      credit: b.credit,
      debit: b.debit,
      amount: b.amount,
      balance: b.balance ?? cur.balance,
      time: b.time || cur.time,
      raw: b.raw || cur.raw,
      description: b.description || cur.description,
    };
    if (dirChanged) dirFixed += 1;
  }

  return { transactions: local, added, dirFixed };
}

export function ensureDiscoveryReviewCategory(categories = []) {
  const list = Array.isArray(categories) ? [...categories] : [];
  if (!list.includes(DISCOVERY_REVIEW_GROUP)) list.unshift(DISCOVERY_REVIEW_GROUP);
  return list;
}
