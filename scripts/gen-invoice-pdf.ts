/**
 * Generates a sample invoice PDF for the AI-agent demo.
 * Writes to demo-nextjs/public/sample-invoice.pdf.
 *
 * Usage: npx ts-node scripts/gen-invoice-pdf.ts
 */
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

const RECIPIENT =
  "addr_test1qqdw6xlva7ray98vvc85wfurmfvg2elp2cfuyfx2xqmy2akh94vvt36jzyzty422ruhemmy0lnxtgxxtdu7rvk3mxxxqlzm4j4";

const INVOICE_NUMBER = "INV-2041";
const ISSUED = new Date().toISOString().slice(0, 10);
const DUE_USD = 2.5;

const OUT_PATH = path.join(
  __dirname,
  "..",
  "demo-nextjs",
  "public",
  "sample-invoice.pdf",
);

const FG = "#0a0a0a";
const MUTED = "#5a5a5a";
const ACCENT = "#f97316";
const LINE = "#cccccc";

async function main() {
  const doc = new PDFDocument({ size: "LETTER", margin: 56 });
  const out = fs.createWriteStream(OUT_PATH);
  doc.pipe(out);

  // Header
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(ACCENT)
    .text("ATLAS · CODE-REVIEW AGENT", { characterSpacing: 2 });

  doc
    .moveDown(0.3)
    .font("Helvetica")
    .fontSize(22)
    .fillColor(FG)
    .text("Invoice", { continued: false });

  doc
    .moveDown(0.2)
    .fontSize(10)
    .fillColor(MUTED)
    .text(
      "Autonomous code-review services, priced in USD and settled in ADA on the Cardano preprod testnet.",
      { width: 480 },
    );

  // Meta row
  doc.moveDown(1.5);
  const metaY = doc.y;
  const colW = 170;

  const metaCol = (x: number, label: string, value: string) => {
    doc
      .fontSize(8)
      .fillColor(MUTED)
      .font("Helvetica-Bold")
      .text(label.toUpperCase(), x, metaY, { characterSpacing: 1.5 });
    doc
      .fontSize(11)
      .fillColor(FG)
      .font("Helvetica")
      .text(value, x, metaY + 14);
  };
  metaCol(56, "Invoice #", INVOICE_NUMBER);
  metaCol(56 + colW, "Issued", ISSUED);
  metaCol(56 + colW * 2, "Due", "On receipt");

  // Divider
  doc
    .moveTo(56, metaY + 44)
    .lineTo(556, metaY + 44)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();

  doc.y = metaY + 58;

  // Billed to
  doc
    .fontSize(8)
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .text("BILLED TO", { characterSpacing: 1.5 });
  doc
    .moveDown(0.3)
    .fontSize(11)
    .fillColor(FG)
    .font("Helvetica")
    .text("Charli3 hackathon judge · via charli3-js demo");

  doc.moveDown(1.5);

  // Line items
  doc
    .fontSize(8)
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .text("DESCRIPTION", 56, doc.y, { characterSpacing: 1.5, continued: true })
    .text("AMOUNT", 0, doc.y, {
      width: 500,
      align: "right",
      characterSpacing: 1.5,
    });

  doc
    .moveTo(56, doc.y + 6)
    .lineTo(556, doc.y + 6)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(1);

  const lineItem = (desc: string, sub: string, usd: number) => {
    const y = doc.y;
    doc
      .fontSize(11)
      .fillColor(FG)
      .font("Helvetica")
      .text(desc, 56, y, { width: 380 });
    doc
      .fontSize(9)
      .fillColor(MUTED)
      .text(sub, 56, doc.y + 2, { width: 380 });
    doc
      .fontSize(11)
      .fillColor(FG)
      .font("Helvetica")
      .text(`$${usd.toFixed(2)}`, 440, y, { width: 116, align: "right" });
    doc.moveDown(1.2);
  };

  lineItem(
    "Pull-request code review",
    "PR #412 · 2 files · 37 lines · turnaround 14 min",
    DUE_USD,
  );

  // Total row
  doc
    .moveTo(56, doc.y)
    .lineTo(556, doc.y)
    .strokeColor(LINE)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.8);

  const totalY = doc.y;
  doc
    .fontSize(9)
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .text("TOTAL DUE", 56, totalY, { characterSpacing: 1.5 });
  doc
    .fontSize(22)
    .fillColor(FG)
    .font("Helvetica")
    .text(`$${DUE_USD.toFixed(2)} USD`, 380, totalY - 4, {
      width: 176,
      align: "right",
    });

  doc.moveDown(2);

  // Settlement box
  const boxY = doc.y;
  doc
    .rect(56, boxY, 500, 150)
    .strokeColor(ACCENT)
    .lineWidth(1)
    .stroke();

  doc
    .fontSize(8)
    .fillColor(ACCENT)
    .font("Helvetica-Bold")
    .text("SETTLE ON CARDANO PREPROD", 72, boxY + 14, {
      characterSpacing: 1.5,
    });

  doc
    .fontSize(10)
    .fillColor(FG)
    .font("Helvetica")
    .text(
      "Pay the USD total in tADA at the current Charli3 ODV rate. Drop this invoice into the charli3-js AI-agent demo — it pulls ADA/USD from the on-chain oracle and builds the payment for you to sign in Lace.",
      72,
      boxY + 32,
      { width: 468 },
    );

  doc
    .fontSize(8)
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .text("PAY TO (preprod address)", 72, boxY + 92, {
      characterSpacing: 1.5,
    });

  doc
    .fontSize(9)
    .fillColor(FG)
    .font("Courier")
    .text(RECIPIENT, 72, boxY + 106, { width: 468 });

  doc.y = boxY + 170;
  doc.moveDown(0.8);

  doc
    .fontSize(8)
    .fillColor(MUTED)
    .font("Helvetica-Bold")
    .text("NOTES", 56, doc.y, { characterSpacing: 1.5 });
  doc
    .fontSize(10)
    .fillColor(FG)
    .font("Helvetica")
    .text("Client needs to be paid in ADA.", 56, doc.y + 4);
  doc.moveDown(1);

  // Footer
  doc
    .fontSize(8)
    .fillColor(MUTED)
    .font("Helvetica")
    .text(
      "Rate source: Charli3 ODV pull oracle · Round-2 aggregate datum on Cardano preprod. Verify the rate at https://preprod.cardanoscan.io by looking up the oracle UTXO shown in the demo.",
      56,
      doc.y,
      { width: 500 },
    );

  doc.end();

  await new Promise<void>((resolve, reject) => {
    out.on("finish", () => resolve());
    out.on("error", reject);
  });

  const size = fs.statSync(OUT_PATH).size;
  console.log(`wrote ${OUT_PATH} (${size} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
