import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

// ─── Helpers ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uid = () => Math.random().toString(36).slice(2, 9);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseName(raw = "") {
  return raw
    .trim()
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function interpolate(template, name) {
  return template.replace(/\{\{name\}\}/gi, name);
}

function generateNodeScript({ smtp, fromName, subject, body, contacts }) {
  const json = JSON.stringify(
    contacts.map((c) => ({ name: c.name, email: c.email })),
    null,
    2
  );
  return `// MailMerge — auto-generated Nodemailer send script
// Setup: npm install nodemailer
// Run:   node send.js

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "${smtp.host}",
  port: ${smtp.port},
  secure: ${smtp.port === 465 || smtp.port === "465"},
  auth: {
    user: "${smtp.user}",
    pass: "${smtp.pass}",
  },
});

const FROM = '"${fromName || smtp.user}" <${smtp.user}>';
const SUBJECT = \`${subject}\`;
const BODY    = \`${body}\`;

const contacts = ${json};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await transporter.verify();
  console.log("✓ SMTP connection verified");

  for (const { name, email } of contacts) {
    const subject = SUBJECT.replace(/\\{\\{name\\}\\}/gi, name);
    const text    = BODY.replace(/\\{\\{name\\}\\}/gi, name);
    try {
      await transporter.sendMail({ from: FROM, to: email, subject, text });
      console.log(\`✓ Sent  → \${name} <\${email}>\`);
    } catch (err) {
      console.error(\`✗ Error → \${email}: \${err.message}\`);
    }
    await delay(500);
  }
  console.log("Done.");
})();
`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Avatar({ name }) {
  const initials = name
    .split(" ")
    .map((w) => w[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
  const colors = ["#4F46E5","#0891B2","#059669","#D97706","#DC2626","#7C3AED","#DB2777"];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: 32, height: 32, borderRadius: "50%",
      background: color + "22", border: `1px solid ${color}44`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 600, color, flexShrink: 0,
      fontFamily: "'DM Mono', monospace",
    }}>
      {initials}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    pending:  { bg: "#F1F5F9", color: "#64748B", label: "Pending" },
    sending:  { bg: "#FEF3C7", color: "#D97706", label: "Sending…" },
    sent:     { bg: "#DCFCE7", color: "#16A34A", label: "Sent" },
    failed:   { bg: "#FEE2E2", color: "#DC2626", label: "Failed" },
    skipped:  { bg: "#F1F5F9", color: "#94A3B8", label: "Skipped" },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 600, padding: "2px 8px",
      borderRadius: 100, letterSpacing: "0.02em",
    }}>
      {status === "sending" && (
        <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: 4 }}>⟳</span>
      )}
      {s.label}
    </span>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: "#FAFAFA", border: "1px solid #E2E8F0",
      borderRadius: 12, padding: "14px 18px",
      borderTop: accent ? `3px solid ${accent}` : "1px solid #E2E8F0",
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: accent || "#0F172A", fontFamily: "'DM Mono', monospace" }}>
        {value}
      </div>
    </div>
  );
}

// ─── Tab: Import ─────────────────────────────────────────────────────────────

function ImportTab({ contacts, setContacts }) {
  const [dragging, setDragging] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const fileRef = useRef();

  const processFile = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const added = [];
        let totalRows = 0;
        const sheets = wb.SheetNames;

        sheets.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
          if (!rows.length) return;
          totalRows += rows.length;
          const cols = Object.keys(rows[0]);

          // Detect email column
          const emailCol =
            cols.find((c) => /^e?mail$/i.test(c)) ||
            cols.find((c) => /email|e-mail/i.test(c)) ||
            cols.find((c) => rows.slice(0, 20).some((r) => EMAIL_RE.test(String(r[c]))));

          // Detect name columns
          const firstCol = cols.find((c) => /first.?name|firstname/i.test(c));
          const lastCol  = cols.find((c) => /last.?name|lastname/i.test(c));
          const nameCol  =
            cols.find((c) => /^(full.?name|name|contact.?name)$/i.test(c)) ||
            (!firstCol && !lastCol
              ? cols.find((c) => !/email|mail|id|phone|tel/i.test(c) && typeof rows[0][c] === "string" && rows[0][c].length > 1 && rows[0][c].length < 80)
              : null);

          rows.forEach((row) => {
            const email = emailCol ? String(row[emailCol]).trim() : "";
            if (!EMAIL_RE.test(email)) return;
            let name = "";
            if (firstCol || lastCol) {
              name = [firstCol ? row[firstCol] : "", lastCol ? row[lastCol] : ""].join(" ").trim();
            } else if (nameCol) {
              name = String(row[nameCol]).trim();
            }
            if (!name) name = parseName(email.split("@")[0]);
            added.push({ id: uid(), name, email, sheet: sheetName, status: "pending", selected: true });
          });
        });

        // Deduplicate against existing
        const existingEmails = new Set(contacts.map((c) => c.email.toLowerCase()));
        const dupeCount = added.filter((c) => existingEmails.has(c.email.toLowerCase())).length;
        const unique = added.filter((c) => {
          const k = c.email.toLowerCase();
          if (existingEmails.has(k)) return false;
          existingEmails.add(k);
          return true;
        });

        setContacts((prev) => [...prev, ...unique]);
        setLastResult({ file: file.name, totalRows, found: added.length, dupes: dupeCount, added: unique.length, sheets });
      } catch (err) {
        alert("Failed to parse file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [contacts, setContacts]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: "none" }}
        onChange={(e) => e.target.files[0] && processFile(e.target.files[0])}
      />

      <div
        onClick={() => fileRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? "#6366F1" : "#CBD5E1"}`,
          borderRadius: 16,
          padding: "48px 24px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "#EEF2FF" : "#FAFAFA",
          transition: "all 0.2s",
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>
          Drop your Excel or CSV file here
        </div>
        <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16 }}>
          Supports <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong> — scans all sheets automatically
        </div>
        <button style={{
          background: "#6366F1", color: "#fff", border: "none",
          padding: "10px 24px", borderRadius: 8, fontSize: 13,
          fontWeight: 600, cursor: "pointer",
        }}>
          Browse files
        </button>
      </div>

      <div style={{ marginTop: 16, padding: "12px 16px", background: "#F8FAFC", borderRadius: 10, border: "1px solid #E2E8F0", fontSize: 13, color: "#475569" }}>
        <strong style={{ color: "#0F172A" }}>Auto-detection:</strong> Scans column headers for keywords like{" "}
        <code style={{ background: "#E2E8F0", padding: "1px 6px", borderRadius: 4 }}>email</code>,{" "}
        <code style={{ background: "#E2E8F0", padding: "1px 6px", borderRadius: 4 }}>name</code>,{" "}
        <code style={{ background: "#E2E8F0", padding: "1px 6px", borderRadius: 4 }}>first_name</code>,{" "}
        <code style={{ background: "#E2E8F0", padding: "1px 6px", borderRadius: 4 }}>last_name</code>. Falls back to pattern-matching cell values.
      </div>

      {lastResult && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6366F1", marginBottom: 12 }}>
            ✓ {lastResult.file}
            {lastResult.sheets.length > 1 && (
              <span style={{ color: "#94A3B8", fontWeight: 400, marginLeft: 8 }}>
                ({lastResult.sheets.length} sheets scanned: {lastResult.sheets.join(", ")})
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <StatCard label="Total Rows" value={lastResult.totalRows} />
            <StatCard label="Emails Found" value={lastResult.found} accent="#6366F1" />
            <StatCard label="Duplicates Removed" value={lastResult.dupes} accent="#F59E0B" />
            <StatCard label="Added" value={lastResult.added} accent="#10B981" />
          </div>
          {contacts.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
              <button
                onClick={() => setContacts([])}
                style={{ padding: "8px 16px", fontSize: 13, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, cursor: "pointer", fontWeight: 500 }}
              >
                Clear all contacts
              </button>
              <button
                onClick={() => fileRef.current.click()}
                style={{ padding: "8px 16px", fontSize: 13, border: "1px solid #E2E8F0", background: "#fff", color: "#0F172A", borderRadius: 8, cursor: "pointer", fontWeight: 500 }}
              >
                + Import another file
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Contacts ───────────────────────────────────────────────────────────

function ContactsTab({ contacts, setContacts }) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const toggleSelect = (id) =>
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));

  const toggleAll = (checked) =>
    setContacts((prev) =>
      prev.map((c) => (filtered.find((f) => f.id === c.id) ? { ...c, selected: checked } : c))
    );

  const removeSelected = () =>
    setContacts((prev) => prev.filter((c) => !c.selected));

  const removeOne = (id) =>
    setContacts((prev) => prev.filter((c) => c.id !== id));

  const resetStatus = (id) =>
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, status: "pending" } : c)));

  const allChecked = filtered.length > 0 && filtered.every((c) => c.selected);
  const selectedCount = contacts.filter((c) => c.selected).length;

  const statusCounts = {
    all: contacts.length,
    pending: contacts.filter((c) => c.status === "pending").length,
    sent: contacts.filter((c) => c.status === "sent").length,
    failed: contacts.filter((c) => c.status === "failed").length,
  };

  if (contacts.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "64px 24px", color: "#94A3B8" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#475569", marginBottom: 6 }}>No contacts yet</div>
        <div style={{ fontSize: 14 }}>Import an Excel or CSV file to get started</div>
      </div>
    );
  }

  return (
    <div>
      {/* toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 200px", padding: "8px 12px", fontSize: 13,
            border: "1px solid #E2E8F0", borderRadius: 8,
            background: "#fff", color: "#0F172A", outline: "none",
          }}
        />
        {["all","pending","sent","failed"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            style={{
              padding: "7px 14px", fontSize: 12, fontWeight: 600,
              borderRadius: 8, border: "1px solid",
              cursor: "pointer", transition: "all 0.15s",
              borderColor: filterStatus === s ? "#6366F1" : "#E2E8F0",
              background: filterStatus === s ? "#EEF2FF" : "#fff",
              color: filterStatus === s ? "#6366F1" : "#475569",
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)} ({statusCounts[s]})
          </button>
        ))}
        {selectedCount > 0 && (
          <button
            onClick={removeSelected}
            style={{
              padding: "7px 14px", fontSize: 12, fontWeight: 600,
              borderRadius: 8, border: "1px solid #FCA5A5",
              background: "#FEF2F2", color: "#DC2626", cursor: "pointer",
            }}
          >
            Remove {selectedCount} selected
          </button>
        )}
      </div>

      {/* table */}
      <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#F8FAFC" }}>
              <th style={{ padding: "10px 14px", textAlign: "left", width: 36 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={(e) => toggleAll(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
              </th>
              <th style={{ padding: "10px 14px", textAlign: "left", color: "#64748B", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Name</th>
              <th style={{ padding: "10px 14px", textAlign: "left", color: "#64748B", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Email</th>
              <th style={{ padding: "10px 14px", textAlign: "left", color: "#64748B", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sheet</th>
              <th style={{ padding: "10px 14px", textAlign: "left", color: "#64748B", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</th>
              <th style={{ padding: "10px 14px", width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr
                key={c.id}
                style={{
                  background: c.selected ? "#F5F3FF" : i % 2 === 0 ? "#fff" : "#FAFAFA",
                  borderTop: "1px solid #F1F5F9",
                }}
              >
                <td style={{ padding: "10px 14px" }}>
                  <input
                    type="checkbox"
                    checked={!!c.selected}
                    onChange={() => toggleSelect(c.id)}
                    style={{ cursor: "pointer" }}
                  />
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={c.name} />
                    <span style={{ fontWeight: 500, color: "#0F172A" }}>{c.name}</span>
                  </div>
                </td>
                <td style={{ padding: "10px 14px", color: "#475569", fontFamily: "'DM Mono', monospace", fontSize: 12 }}>{c.email}</td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: "#F1F5F9", color: "#64748B", fontWeight: 500 }}>
                    {c.sheet}
                  </span>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <StatusBadge status={c.status} />
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {(c.status === "sent" || c.status === "failed") && (
                      <button
                        onClick={() => resetStatus(c.id)}
                        title="Reset to pending"
                        style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#94A3B8", padding: "2px 4px", borderRadius: 4 }}
                      >
                        ↺
                      </button>
                    )}
                    <button
                      onClick={() => removeOne(c.id)}
                      title="Remove"
                      style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#94A3B8", padding: "2px 4px", borderRadius: 4 }}
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                  No contacts match your filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: "#94A3B8" }}>
        Showing {filtered.length} of {contacts.length} contacts
      </div>
    </div>
  );
}

// ─── Tab: Compose ─────────────────────────────────────────────────────────────

function ComposeTab({ smtp, setSmtp, compose, setCompose, contacts }) {
  const [showPreview, setShowPreview] = useState(false);
  const sample = contacts.find((c) => c.selected) || contacts[0];
  const previewName = sample?.name || "Sample Name";

  const field = (label, key, type = "text", placeholder = "") => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        value={smtp[key] || ""}
        onChange={(e) => setSmtp((p) => ({ ...p, [key]: e.target.value }))}
        style={{
          padding: "9px 12px", fontSize: 13, borderRadius: 8,
          border: "1px solid #E2E8F0", background: "#fff",
          color: "#0F172A", outline: "none", fontFamily: "'DM Mono', monospace",
        }}
      />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* SMTP */}
      <section>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🔐</span> SMTP Configuration
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          {field("SMTP Host", "host", "text", "smtp.gmail.com")}
          {field("Port", "port", "number", "587")}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          {field("Username / Email", "user", "email", "you@gmail.com")}
          {field("App Password", "pass", "password", "••••••••••••")}
          {field("From Name", "fromName", "text", "Your Name")}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Encryption
            </label>
            <select
              value={smtp.enc || "STARTTLS"}
              onChange={(e) => setSmtp((p) => ({ ...p, enc: e.target.value, port: e.target.value === "SSL" ? "465" : e.target.value === "none" ? "25" : "587" }))}
              style={{ padding: "9px 12px", fontSize: 13, borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#0F172A", outline: "none" }}
            >
              <option value="STARTTLS">STARTTLS (port 587)</option>
              <option value="SSL">SSL / TLS (port 465)</option>
              <option value="none">None (port 25)</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 12, padding: "10px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, fontSize: 12, color: "#92400E" }}>
          💡 For Gmail, create an <strong>App Password</strong> at myaccount.google.com/apppasswords (requires 2FA enabled)
        </div>
      </section>

      <div style={{ borderTop: "1px solid #F1F5F9" }} />

      {/* Email content */}
      <section>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>✉️</span> Email Content
        </div>
        <div style={{ fontSize: 12, color: "#64748B", marginBottom: 14 }}>
          Use <code style={{ background: "#E2E8F0", padding: "1px 6px", borderRadius: 4 }}>{"{{name}}"}</code> to personalise each email with the recipient's name.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Subject</label>
            <input
              type="text"
              placeholder="Hello {{name}}, here's something for you!"
              value={compose.subject}
              onChange={(e) => setCompose((p) => ({ ...p, subject: e.target.value }))}
              style={{ padding: "9px 12px", fontSize: 13, borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#0F172A", outline: "none" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Message Body</label>
            <textarea
              rows={8}
              placeholder={"Hi {{name}},\n\nI wanted to reach out…\n\nBest regards"}
              value={compose.body}
              onChange={(e) => setCompose((p) => ({ ...p, body: e.target.value }))}
              style={{
                padding: "10px 12px", fontSize: 13, borderRadius: 8,
                border: "1px solid #E2E8F0", background: "#fff",
                color: "#0F172A", outline: "none", resize: "vertical",
                lineHeight: 1.7, fontFamily: "inherit",
              }}
            />
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button
            onClick={() => setShowPreview((p) => !p)}
            style={{ padding: "9px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", cursor: "pointer" }}
          >
            {showPreview ? "Hide preview" : "👁 Preview"}
          </button>
        </div>
      </section>

      {/* Preview */}
      {showPreview && (
        <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ background: "#F8FAFC", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: "1px solid #E2E8F0" }}>
            Preview — {sample ? `sent to ${previewName}` : "no contacts imported yet"}
          </div>
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 4 }}>From: {smtp.fromName || smtp.user || "Sender"} &lt;{smtp.user || "sender@example.com"}&gt;</div>
            <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10 }}>To: {sample?.email || "recipient@example.com"}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", marginBottom: 12 }}>
              {compose.subject ? interpolate(compose.subject, previewName) : "(no subject)"}
            </div>
            <pre style={{ fontSize: 13, color: "#334155", lineHeight: 1.8, fontFamily: "inherit", whiteSpace: "pre-wrap", margin: 0 }}>
              {compose.body ? interpolate(compose.body, previewName) : "(no body)"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Send ────────────────────────────────────────────────────────────────

function SendTab({ contacts, setContacts, smtp, compose }) {
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [scriptText, setScriptText] = useState("");
  const stopRef = useRef(false);

  const pending = contacts.filter((c) => c.selected && c.status === "pending");
  const sent    = contacts.filter((c) => c.status === "sent").length;
  const failed  = contacts.filter((c) => c.status === "failed").length;
  const total   = contacts.filter((c) => c.selected).length;
  const done    = sent + failed;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;

  const addLog = (msg, type = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((p) => [...p, { id: uid(), time, msg, type }]);
  };

  const startMockSend = async () => {
    if (!pending.length) { addLog("No pending contacts to send to.", "warn"); return; }
    if (!compose.subject || !compose.body) { addLog("Please fill in subject and body in the Compose tab.", "warn"); return; }
    stopRef.current = false;
    setRunning(true);
    setLogs([]);
    addLog(`Starting mock send to ${pending.length} contacts…`, "info");

    for (const contact of pending) {
      if (stopRef.current) { addLog("Stopped by user.", "warn"); break; }
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, status: "sending" } : c)));
      await sleep(400 + Math.random() * 500);
      const ok = Math.random() > 0.04;
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? { ...c, status: ok ? "sent" : "failed" } : c)));
      addLog(
        ok ? `✓ Sent → ${contact.name} <${contact.email}>` : `✗ Failed → ${contact.email} (connection refused)`,
        ok ? "ok" : "err"
      );
      await sleep(100);
    }
    setRunning(false);
    addLog("Mock send complete.", "info");
  };

  const stopSend = () => { stopRef.current = true; setRunning(false); };

  const handleGenerateScript = () => {
    const script = generateNodeScript({
      smtp,
      fromName: smtp.fromName,
      subject: compose.subject,
      body: compose.body,
      contacts: contacts.filter((c) => c.selected),
    });
    setScriptText(script);
    setShowScript(true);
  };

  const copyScript = () => {
    navigator.clipboard.writeText(scriptText).then(() => alert("Script copied to clipboard!"));
  };

  const resetAll = () => {
    setContacts((prev) => prev.map((c) => ({ ...c, status: "pending" })));
    setLogs([]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Notice */}
      <div style={{ padding: "12px 16px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, fontSize: 13, color: "#92400E", lineHeight: 1.6 }}>
        <strong>Browser limitation:</strong> Raw SMTP connections cannot be opened from a browser tab due to security policies.
        Use <strong>Mock Send</strong> to simulate the full flow here, or <strong>Export Node.js Script</strong> to run real delivery locally with{" "}
        <code style={{ background: "#FEF3C7", padding: "1px 5px", borderRadius: 4 }}>node send.js</code>.
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
        <StatCard label="Selected" value={total} />
        <StatCard label="Sent" value={sent} accent="#10B981" />
        <StatCard label="Failed" value={failed} accent="#EF4444" />
        <StatCard label="Remaining" value={pending.length} accent="#6366F1" />
      </div>

      {/* Progress */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "#64748B" }}>
          <span>Progress</span><span>{pct}%</span>
        </div>
        <div style={{ height: 8, background: "#F1F5F9", borderRadius: 100, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: pct + "%",
            background: "linear-gradient(90deg, #6366F1, #8B5CF6)",
            borderRadius: 100, transition: "width 0.4s ease",
          }} />
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {!running ? (
          <button
            onClick={startMockSend}
            disabled={pending.length === 0}
            style={{
              padding: "10px 22px", fontSize: 13, fontWeight: 700, borderRadius: 8,
              border: "none", background: pending.length === 0 ? "#E2E8F0" : "#6366F1",
              color: pending.length === 0 ? "#94A3B8" : "#fff",
              cursor: pending.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            ▶ Mock Send ({pending.length} contacts)
          </button>
        ) : (
          <button
            onClick={stopSend}
            style={{ padding: "10px 22px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: "#EF4444", color: "#fff", cursor: "pointer" }}
          >
            ■ Stop
          </button>
        )}
        <button
          onClick={handleGenerateScript}
          style={{ padding: "10px 22px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#0F172A", cursor: "pointer" }}
        >
          {"</>"} Export Node.js Script
        </button>
        <button
          onClick={resetAll}
          style={{ padding: "10px 22px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", cursor: "pointer" }}
        >
          ↺ Reset All
        </button>
      </div>

      {/* Log */}
      {logs.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Send Log
          </div>
          <div style={{
            background: "#0F172A", borderRadius: 10, padding: "14px 16px",
            maxHeight: 240, overflowY: "auto",
            fontFamily: "'DM Mono', monospace", fontSize: 12, lineHeight: 1.8,
          }}>
            {logs.map((l) => (
              <div key={l.id} style={{ color: l.type === "ok" ? "#4ADE80" : l.type === "err" ? "#F87171" : l.type === "warn" ? "#FCD34D" : "#94A3B8" }}>
                <span style={{ color: "#4B5563" }}>{l.time} </span>{l.msg}
              </div>
            ))}
            {running && <div style={{ color: "#6366F1", animation: "blink 1s infinite" }}>▌</div>}
          </div>
        </div>
      )}

      {/* Generated Script */}
      {showScript && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Generated Node.js Script</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={copyScript} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", cursor: "pointer" }}>
                Copy
              </button>
              <button onClick={() => setShowScript(false)} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
          <div style={{ padding: "10px 12px", background: "#DCFCE7", borderRadius: 8, fontSize: 12, color: "#15803D", marginBottom: 10, fontWeight: 500 }}>
            Run this with: <code style={{ fontFamily: "'DM Mono', monospace" }}>npm install nodemailer && node send.js</code>
          </div>
          <pre style={{
            background: "#0F172A", color: "#E2E8F0",
            borderRadius: 10, padding: "16px", fontSize: 12,
            overflowX: "auto", overflowY: "auto", maxHeight: 400,
            lineHeight: 1.7, fontFamily: "'DM Mono', monospace",
            whiteSpace: "pre", margin: 0,
          }}>
            {scriptText}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

const TABS = ["import", "contacts", "compose", "send"];
const TAB_LABELS = { import: "📥 Import", contacts: "👥 Contacts", compose: "✏️ Compose", send: "🚀 Send" };

export default function MailMerge() {
  const [tab, setTab] = useState("import");
  const [contacts, setContacts] = useState([]);
  const [smtp, setSmtp] = useState({ host: "smtp.gmail.com", port: "587", user: "", pass: "", fromName: "", enc: "STARTTLS" });
  const [compose, setCompose] = useState({ subject: "", body: "" });

  const pendingCount = contacts.filter((c) => c.selected && c.status === "pending").length;
  const sentCount    = contacts.filter((c) => c.status === "sent").length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; background: #F8FAFC; margin: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #F1F5F9; }
        ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
        input[type=checkbox] { accent-color: #6366F1; width: 15px; height: 15px; cursor: pointer; }
        input:focus, textarea:focus, select:focus { box-shadow: 0 0 0 3px #6366F133 !important; border-color: #6366F1 !important; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'DM Sans', sans-serif" }}>
        {/* Top bar */}
        <div style={{
          background: "#fff", borderBottom: "1px solid #E2E8F0",
          padding: "0 32px", position: "sticky", top: 0, zIndex: 100,
        }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0" }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16,
              }}>✉️</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>MailMerge</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: -2 }}>Excel → SMTP email tool</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {contacts.length > 0 && (
                <>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, background: "#EEF2FF", color: "#6366F1", fontWeight: 600, alignSelf: "center", marginRight: 8 }}>
                    {contacts.length} contacts
                  </span>
                  {sentCount > 0 && (
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 100, background: "#DCFCE7", color: "#16A34A", fontWeight: 600, alignSelf: "center", marginRight: 8 }}>
                      {sentCount} sent
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "0 32px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto", display: "flex" }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "12px 20px", fontSize: 13, fontWeight: 600,
                  border: "none", borderBottom: `2px solid ${tab === t ? "#6366F1" : "transparent"}`,
                  background: "none", color: tab === t ? "#6366F1" : "#64748B",
                  cursor: "pointer", transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {TAB_LABELS[t]}
                {t === "contacts" && contacts.length > 0 && (
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 100, background: "#6366F1", color: "#fff" }}>
                    {contacts.length}
                  </span>
                )}
                {t === "send" && pendingCount > 0 && (
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 100, background: "#F59E0B", color: "#fff" }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 32px" }}>
          {tab === "import"   && <ImportTab   contacts={contacts} setContacts={setContacts} />}
          {tab === "contacts" && <ContactsTab contacts={contacts} setContacts={setContacts} />}
          {tab === "compose"  && <ComposeTab  smtp={smtp} setSmtp={setSmtp} compose={compose} setCompose={setCompose} contacts={contacts} />}
          {tab === "send"     && <SendTab     contacts={contacts} setContacts={setContacts} smtp={smtp} compose={compose} />}
        </div>
      </div>
    </>
  );
}