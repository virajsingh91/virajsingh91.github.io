import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, BookOpen, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const INK = "#12181F";
const INK_SOFT = "#1B222C";
const PAPER = "#F7F4EC";
const PAPER_DIM = "#EFEADA";
const BRASS = "#B8934A";
const BRASS_DIM = "#8C6F3B";
const POSITIVE = "#2F6E4F";
const NEGATIVE = "#AF4A3A";
const SLATE = "#6B7280";
const LINE = "#DBD4C1";

const SERIF = "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif";
const MONO = "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const EXPENSE_CATEGORIES = [
  "Housing",
  "Food",
  "Transport",
  "Utilities",
  "Health",
  "Leisure",
  "Shopping",
  "Debt",
  "Savings",
  "Childcare",
  "Other",
];
const INCOME_CATEGORIES = ["Salary", "Freelance", "Investment", "Gift", "Other"];

const CATEGORY_COLORS = {
  Housing: "#B8934A",
  Food: "#8C6F3B",
  Transport: "#6B8F71",
  Utilities: "#7A6C8F",
  Health: "#AF4A3A",
  Leisure: "#5B7B8F",
  Shopping: "#9C7A5A",
  Debt: "#9C4A4A",
  Savings: "#4A7A9C",
  Childcare: "#B06BA0",
  Other: "#6B7280",
};

const storage = {
  get: async (key, useSession = false) => {
    const value = useSession ? sessionStorage.getItem(key) : localStorage.getItem(key);
    return value ? { value } : null;
  },
  set: async (key, value, useSession = false) => {
    if (useSession) sessionStorage.setItem(key, value);
    else localStorage.setItem(key, value);
  }
};

window.storage = storage;

function fmt(n) {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function occurrencesFor(source, from, through) {
  const out = [];
  if (source.frequency === "semimonthly") {
    const start = new Date(from + "T00:00:00");
    const end = new Date(through + "T00:00:00");
    let y = start.getFullYear();
    let m = start.getMonth();
    while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) {
      source.days.forEach((day) => {
        const clamped = Math.min(day, daysInMonth(y, m));
        const iso = new Date(y, m, clamped).toISOString().slice(0, 10);
        if (iso >= from && iso <= through) out.push(iso);
      });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  } else if (source.frequency === "biweekly") {
    let cursor = source.anchorDate;
    while (cursor > from) cursor = addDaysISO(cursor, -14);
    while (cursor < from) cursor = addDaysISO(cursor, 14);
    while (cursor <= through) {
      out.push(cursor);
      cursor = addDaysISO(cursor, 14);
    }
  } else if (source.frequency === "monthly") {
    const start = new Date(from + "T00:00:00");
    const end = new Date(through + "T00:00:00");
    let y = start.getFullYear();
    let m = start.getMonth();
    while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) {
      const clamped = Math.min(source.day, daysInMonth(y, m));
      const iso = new Date(y, m, clamped).toISOString().slice(0, 10);
      if (iso >= from && iso <= through) out.push(iso);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }
  return out.sort();
}

export default function Ledger() {
  const [transactions, setTransactions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayISO());
  const [error, setError] = useState("");

  const [recurringSources, setRecurringSources] = useState([
    { id: "viraj", name: "Viraj", type: "income", amount: 4300, frequency: "semimonthly", days: [15, 31] },
    { id: "pratima", name: "Pratima", type: "income", amount: 5100, frequency: "biweekly", anchorDate: todayISO() },
    { id: "rent", name: "Rent", type: "expense", category: "Housing", amount: 4760, frequency: "monthly", day: 1 },
    { id: "carloan", name: "Car loan", type: "expense", category: "Transport", amount: 567, frequency: "monthly", day: 1 },
    { id: "electricity", name: "Electricity", type: "expense", category: "Utilities", amount: 180, frequency: "monthly", day: 1 },
    { id: "water", name: "Water & sewage", type: "expense", category: "Utilities", amount: 100, frequency: "monthly", day: 1 },
    { id: "plan529", name: "529 Plan", type: "expense", category: "Savings", amount: 400, frequency: "monthly", day: 1 },
    { id: "capone", name: "Capital One Venture X", type: "expense", category: "Debt", amount: 2500, frequency: "monthly", day: 1 },
    { id: "amex", name: "Amex Gold", type: "expense", category: "Debt", amount: 2500, frequency: "monthly", day: 1 },
    { id: "nanny", name: "Nanny", type: "expense", category: "Childcare", amount: 4000, frequency: "monthly", day: 1 },
  ]);
  const [recurLoaded, setRecurLoaded] = useState(false);
  const [genThrough, setGenThrough] = useState(addDaysISO(todayISO(), 90));
  const [genFrom, setGenFrom] = useState(todayISO().slice(0, 8) + "01");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("transactions", false);
        if (res && res.value) {
          setTransactions(JSON.parse(res.value));
        }
      } catch (e) {
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await window.storage.set("transactions", JSON.stringify(transactions), false);
      } catch (e) {
        console.error("Failed to save ledger", e);
      }
    })();
  }, [transactions, loaded]);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("recurringSources", false);
        if (res && res.value) {
          setRecurringSources(JSON.parse(res.value));
        }
      } catch (e) {
      } finally {
        setRecurLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!recurLoaded) return;
    (async () => {
      try {
        await window.storage.set("recurringSources", JSON.stringify(recurringSources), false);
      } catch (e) {
        console.error("Failed to save recurring sources", e);
      }
    })();
  }, [recurringSources, recurLoaded]);

  function generateRecurring() {
    setTransactions((prev) => {
      const existingKeys = new Set(prev.filter((t) => t.recurringKey).map((t) => t.recurringKey));
      const additions = [];
      recurringSources.forEach((source) => {
        const dates = occurrencesFor(source, genFrom, genThrough);
        dates.forEach((iso) => {
          const key = source.id + "|" + iso;
          if (existingKeys.has(key)) return;
          additions.push({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + iso,
            type: source.type,
            amount: source.amount,
            category: source.type === "income" ? "Salary" : source.category,
            description: source.name,
            date: iso,
            recurringKey: key,
          });
        });
      });
      return [...prev, ...additions];
    });
  }

  const sorted = useMemo(
    () => [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    [transactions]
  );

  let running = 0;
  const rows = sorted.map((t) => {
    running += t.type === "income" ? t.amount : -t.amount;
    return { ...t, balance: running };
  });

  const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const net = totalIncome - totalExpense;

  const byCategory = useMemo(() => {
    const map = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + t.amount;
      });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  function handleTypeChange(newType) {
    setType(newType);
    setCategory(newType === "expense" ? EXPENSE_CATEGORIES[0] : INCOME_CATEGORIES[0]);
  }

  function addTransaction(e) {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!date) {
      setError("Pick a date.");
      return;
    }
    setError("");
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type,
      amount: Math.round(num * 100) / 100,
      category,
      description: description.trim(),
      date,
    };
    setTransactions((prev) => [...prev, entry]);
    setAmount("");
    setDescription("");
  }

  function removeTransaction(id) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  const categories = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <div style={{ background: INK, minHeight: "100vh", fontFamily: SANS }} className="w-full">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-8 sm:mb-10">
          <div className="flex items-center gap-3">
            <BookOpen size={22} color={BRASS} strokeWidth={1.5} />
            <div>
              <h1 style={{ fontFamily: SERIF, color: PAPER, letterSpacing: "0.02em" }} className="text-2xl sm:text-3xl">
                The Ledger
              </h1>
              <p style={{ color: SLATE }} className="text-xs sm:text-sm mt-0.5">
                A running record of income and expense
              </p>
            </div>
          </div>
        </div>

        <div
          className="grid grid-cols-3 rounded-sm mb-8 sm:mb-10 overflow-hidden"
          style={{ border: `1px solid ${BRASS_DIM}` }}
        >
          {[
            { label: "Income", value: totalIncome, color: POSITIVE, icon: ArrowUpRight },
            { label: "Expense", value: totalExpense, color: NEGATIVE, icon: ArrowDownRight },
            { label: "Net", value: net, color: net >= 0 ? BRASS : NEGATIVE, icon: null },
          ].map((s, i) => (
            <div
              key={s.label}
              className="px-4 sm:px-6 py-5 sm:py-6"
              style={{
                background: INK_SOFT,
                borderLeft: i === 0 ? "none" : `1px solid ${BRASS_DIM}`,
              }}
            >
              <div style={{ color: SLATE }} className="text-[10px] sm:text-xs uppercase tracking-widest mb-2">
                {s.label}
              </div>
              <div
                style={{ fontFamily: MONO, color: s.color, fontVariantNumeric: "tabular-nums" }}
                className="text-lg sm:text-2xl"
              >
                {fmt(s.value)}
              </div>
            </div>
          ))}
        </div>

        <div
          className="rounded-sm p-5 sm:p-6 mb-8 sm:mb-10"
          style={{ background: PAPER, border: `1px solid ${LINE}` }}
        >
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 style={{ fontFamily: SERIF, color: INK }} className="text-lg">
              Fixed income &amp; expenses
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <label style={{ color: SLATE }} className="text-xs">
                From
              </label>
              <input
                type="date"
                value={genFrom}
                onChange={(e) => setGenFrom(e.target.value)}
                style={{ border: `1px solid ${LINE}`, color: INK, fontFamily: SANS, background: "#fff" }}
                className="rounded-sm px-2 py-1.5 text-xs outline-none"
              />
              <label style={{ color: SLATE }} className="text-xs">
                through
              </label>
              <input
                type="date"
                value={genThrough}
                onChange={(e) => setGenThrough(e.target.value)}
                style={{ border: `1px solid ${LINE}`, color: INK, fontFamily: SANS, background: "#fff" }}
                className="rounded-sm px-2 py-1.5 text-xs outline-none"
              />
              <button
                onClick={generateRecurring}
                style={{ background: BRASS, color: PAPER, fontFamily: SANS }}
                className="rounded-sm px-3 py-1.5 text-xs hover:opacity-90 transition-opacity"
              >
                Generate entries
              </button>
            </div>
          </div>

          <div style={{ color: SLATE }} className="text-xs uppercase tracking-widest mb-2">
            Income
          </div>
          <div className="space-y-3 mb-5">
            {recurringSources
              .filter((s) => s.type === "income")
              .map((source, idx) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between gap-3 flex-wrap py-2"
                  style={{ borderTop: idx === 0 ? "none" : `1px solid ${LINE}` }}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span style={{ color: INK, fontFamily: SANS }} className="text-sm w-28">
                      {source.name}
                    </span>
                    <span style={{ fontFamily: MONO, color: POSITIVE }} className="text-sm">
                      {fmt(source.amount)}
                    </span>
                    <span style={{ color: SLATE }} className="text-xs">
                      {source.frequency === "semimonthly"
                        ? `on the ${source.days.join(" & ")}`
                        : `every 2 weeks, anchored ${source.anchorDate}`}
                    </span>
                  </div>
                  {source.frequency === "biweekly" && (
                    <div className="flex items-center gap-2">
                      <label style={{ color: SLATE }} className="text-xs">
                        last/next payday
                      </label>
                      <input
                        type="date"
                        value={source.anchorDate}
                        onChange={(e) =>
                          setRecurringSources((prev) =>
                            prev.map((s) => (s.id === source.id ? { ...s, anchorDate: e.target.value } : s))
                          )
                        }
                        style={{ border: `1px solid ${LINE}`, color: INK, fontFamily: SANS, background: "#fff" }}
                        className="rounded-sm px-2 py-1 text-xs outline-none"
                      />
                    </div>
                  )}
                </div>
              ))}
          </div>

          <div style={{ color: SLATE }} className="text-xs uppercase tracking-widest mb-2">
            Expenses
          </div>
          <div className="space-y-3">
            {recurringSources
              .filter((s) => s.type === "expense")
              .map((source, idx) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between gap-3 flex-wrap py-2"
                  style={{ borderTop: idx === 0 ? "none" : `1px solid ${LINE}` }}
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span style={{ color: INK, fontFamily: SANS }} className="text-sm w-40">
                      {source.name}
                    </span>
                    <span style={{ fontFamily: MONO, color: NEGATIVE }} className="text-sm">
                      {fmt(source.amount)}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: (CATEGORY_COLORS[source.category] || SLATE) + "22",
                        color: CATEGORY_COLORS[source.category] || SLATE,
                      }}
                    >
                      {source.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label style={{ color: SLATE }} className="text-xs">
                      due day
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={source.day}
                      onChange={(e) =>
                        setRecurringSources((prev) =>
                          prev.map((s) =>
                            s.id === source.id ? { ...s, day: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) } : s
                          )
                        )
                      }
                      style={{ border: `1px solid ${LINE}`, color: INK, fontFamily: MONO, background: "#fff" }}
                      className="rounded-sm w-16 px-2 py-1 text-xs outline-none"
                    />
                  </div>
                </div>
              ))}
          </div>

          <p style={{ color: SLATE }} className="text-xs mt-4">
            "Generate entries" adds one entry per payday/due date in the range above, skipping anything already in
            the register. Set Pratima's anchor date and each bill's due day to match reality — I defaulted the bills
            to the 1st of the month since you didn't specify due dates.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 mb-8 sm:mb-10">
          <div
            className="lg:col-span-3 rounded-sm p-5 sm:p-6"
            style={{ background: PAPER, border: `1px solid ${LINE}` }}
          >
            <h2 style={{ fontFamily: SERIF, color: INK }} className="text-lg mb-4">
              New entry
            </h2>
            <form onSubmit={addTransaction} className="space-y-4">
              <div className="flex rounded-sm overflow-hidden" style={{ border: `1px solid ${BRASS_DIM}` }}>
                {["expense", "income"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className="flex-1 py-2 text-sm capitalize transition-colors"
                    style={{
                      background: type === t ? BRASS : "transparent",
                      color: type === t ? PAPER : INK,
                      fontFamily: SANS,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={{ color: SLATE }} className="text-xs uppercase tracking-wide block mb-1">
                    Amount
                  </label>
                  <div className="flex items-center rounded-sm" style={{ border: `1px solid ${LINE}`, background: "#fff" }}>
                    <span style={{ color: SLATE, fontFamily: MONO }} className="pl-3 text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      style={{ fontFamily: MONO, color: INK }}
                      className="w-full bg-transparent px-2 py-2 text-sm outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label style={{ color: SLATE }} className="text-xs uppercase tracking-wide block mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ border: `1px solid ${LINE}`, color: INK, fontFamily: SANS, background: "#fff" }}
                    className="w-full rounded-sm px-2 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label style={{ color: SLATE }} className="text-xs uppercase tracking-wide block mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    style={{ border: `1px solid ${LINE}`, color: INK, fontFamily: SANS, background: "#fff" }}
                    className="w-full rounded-sm px-2 py-2 text-sm outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ color: SLATE }} className="text-xs uppercase tracking-wide block mb-1">
                    Note (optional)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. groceries"
                    style={{ border: `1px solid ${LINE}`, color: INK, fontFamily: SANS, background: "#fff" }}
                    className="w-full rounded-sm px-2 py-2 text-sm outline-none"
                  />
                </div>
              </div>

              {error && (
                <div style={{ color: NEGATIVE }} className="text-xs">
                  {error}
                </div>
              )}

              <button
                type="submit"
                style={{ background: INK, color: PAPER, fontFamily: SANS }}
                className="w-full flex items-center justify-center gap-2 rounded-sm py-2.5 text-sm hover:opacity-90 transition-opacity"
              >
                <Plus size={15} />
                Add to ledger
              </button>
            </form>
          </div>

          <div
            className="lg:col-span-2 rounded-sm p-5 sm:p-6 flex flex-col"
            style={{ background: PAPER, border: `1px solid ${LINE}` }}
          >
            <h2 style={{ fontFamily: SERIF, color: INK }} className="text-lg mb-2">
              Where it goes
            </h2>
            {byCategory.length === 0 ? (
              <div style={{ color: SLATE }} className="text-sm flex-1 flex items-center justify-center text-center py-8">
                Expense entries will break down by category here.
              </div>
            ) : (
              <>
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={byCategory}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                        stroke={PAPER}
                        strokeWidth={2}
                      >
                        {byCategory.map((entry) => (
                          <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || SLATE} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v) => fmt(v)}
                        contentStyle={{ fontFamily: SANS, fontSize: 12, borderRadius: 4, border: `1px solid ${LINE}` }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 mt-2">
                  {byCategory.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ background: CATEGORY_COLORS[c.name] || SLATE }}
                        />
                        <span style={{ color: INK }}>{c.name}</span>
                      </div>
                      <span style={{ fontFamily: MONO, color: SLATE, fontVariantNumeric: "tabular-nums" }}>
                        {fmt(c.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-sm overflow-hidden" style={{ background: PAPER, border: `1px solid ${LINE}` }}>
          <div className="px-5 sm:px-6 py-4" style={{ borderBottom: `1px solid ${LINE}` }}>
            <h2 style={{ fontFamily: SERIF, color: INK }} className="text-lg">
              Register
            </h2>
          </div>
          {rows.length === 0 ? (
            <div style={{ color: SLATE }} className="text-sm text-center py-12">
              No entries yet. Add your first one above.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: SLATE }} className="text-xs uppercase tracking-wide">
                    <th className="text-left font-normal px-5 sm:px-6 py-2">Date</th>
                    <th className="text-left font-normal px-2 py-2">Description</th>
                    <th className="text-left font-normal px-2 py-2">Category</th>
                    <th className="text-right font-normal px-2 py-2">Amount</th>
                    <th className="text-right font-normal px-2 py-2">Balance</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice()
                    .reverse()
                    .map((t, i) => (
                      <tr
                        key={t.id}
                        style={{
                          borderTop: `1px solid ${LINE}`,
                          background: i % 2 === 0 ? "transparent" : PAPER_DIM,
                        }}
                      >
                        <td style={{ color: INK, fontFamily: MONO }} className="px-5 sm:px-6 py-2.5 whitespace-nowrap">
                          {t.date}
                        </td>
                        <td style={{ color: INK }} className="px-2 py-2.5">
                          {t.description || <span style={{ color: SLATE }}>—</span>}
                        </td>
                        <td className="px-2 py-2.5">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              background: (CATEGORY_COLORS[t.category] || SLATE) + "22",
                              color: CATEGORY_COLORS[t.category] || SLATE,
                            }}
                          >
                            {t.category}
                          </span>
                        </td>
                        <td
                          className="px-2 py-2.5 text-right whitespace-nowrap"
                          style={{
                            fontFamily: MONO,
                            color: t.type === "income" ? POSITIVE : NEGATIVE,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {t.type === "income" ? "+" : "-"}
                          {fmt(t.amount)}
                        </td>
                        <td
                          className="px-2 py-2.5 text-right whitespace-nowrap"
                          style={{ fontFamily: MONO, color: SLATE, fontVariantNumeric: "tabular-nums" }}
                        >
                          {fmt(t.balance)}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <button
                            onClick={() => removeTransaction(t.id)}
                            style={{ color: SLATE }}
                            className="hover:opacity-70 transition-opacity"
                            aria-label="Delete entry"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p style={{ color: SLATE }} className="text-xs text-center mt-6">
          Entries are saved automatically and stay private to you.
        </p>
      </div>
    </div>
  );
}
