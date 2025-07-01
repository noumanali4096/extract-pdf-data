const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// ====================== Extraction Functions ======================
function extractFromLines(label, lines, keys, options = { optional: false }) {
  for (let i = 0; i < lines.length; i++) {
    for (let key of keys) {
      if (lines[i].toLowerCase().includes(key.toLowerCase())) {
        const value = lines[i].split(/[:\-]/)[1] || lines[i + 1];
        if (value) return value.trim();
      }
    }
  }
  if (!options.optional) console.warn(`⚠️ ${label} not found.`);
  return null;
}

function extractGroupedBlock(lines, startLabel, keys) {
  const idx = lines.findIndex((line) =>
    line.toLowerCase().includes(startLabel.toLowerCase())
  );
  if (idx === -1) return null;
  const group = lines.slice(idx + 1, idx + 10);
  return (
    keys
      .map((k) => {
        const l = group.find((line) =>
          line.toLowerCase().startsWith(k.toLowerCase())
        );
        return l?.split(/[:#]/)[1]?.trim();
      })
      .filter(Boolean)
      .join(", ") || null
  );
}

function extractClientBlock(lines) {
  const idx = lines.findIndex((line) =>
    line.toLowerCase().startsWith("client")
  );
  if (idx === -1) return null;
  const group = lines.slice(idx + 1, idx + 4);
  const clean = group
    .map((l) => l.split(/[:\-]/)[1]?.trim() || l)
    .filter(Boolean);
  return clean.join(", ") || null;
}

function extractFreightConsignee(lines) {
  const start = lines.findIndex((l) => l.toLowerCase().startsWith("consignee"));
  if (start === -1) return null;
  const group = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/pickup|^\s*$/i.test(lines[i])) break;
    group.push(lines[i]);
  }
  return group.map((line) => line.trim()).join(", ") || null;
}

function extractIssuePlaceAndDate(text, lines) {
  const placeDateMatch = text.match(
    /Place,\s*Date:\s*\n?\s*(.+?),\s*(\w+ \d{1,2}, \d{4})/
  );
  if (placeDateMatch) {
    return {
      issuePlace: placeDateMatch[1].trim(),
      issueDate: placeDateMatch[2].trim(),
    };
  }

  const dateLine = lines.find((l) => /Date:/.test(l));
  const fallbackDate = dateLine?.match(/\w+ \d{1,2}, \d{4}/)?.[0];
  const addressLine = lines.find((l) => /Toronto|Frankfurt|New York/i.test(l));
  const fallbackPlace =
    addressLine?.match(/\b(Toronto|Frankfurt|New York)\b/i)?.[0] || null;

  return {
    issuePlace: fallbackPlace,
    issueDate: fallbackDate || null,
  };
}

// ====================== API Endpoint ======================
app.post('/extract-freight', (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "OCR text is required" });
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const { issuePlace, issueDate } = extractIssuePlaceAndDate(text, lines);
    const signatureRaw = extractFromLines("Shipper Signature", lines, [
      "Signature of Shipper",
      "Stamp / Signature",
    ]);

    const extracted = {
      poNumber: text.match(/PO\s*#?\s*[:\-]?\s*(\d{5,})/i)?.[1] || null,
      invoiceNumber: text.match(/Invoice\s*#?\s*[:\-]?\s*(INV[\w\-]+)/i)?.[1] || null,
      awbNumber: extractFromLines("AWB Number", lines, ["AWB Number", "Air Waybill", "KC Number"], { optional: true }),
      shipperNameAndAddress: extractGroupedBlock(lines, "Shipper/Exporter", ["Name", "Address", "Contact Name", "Contact Phone"]) || extractClientBlock(lines) || null,
      consigneeNameAndAddress: extractGroupedBlock(lines, "Consignee/Delivery", ["Name", "Address", "Contact Name", "Contact Phone"]) || extractFreightConsignee(lines) || null,
      importerInfo: extractGroupedBlock(lines, "Importer/Buyer", ["Name", "Address", "Contact Name", "Contact Phone"]) || null,
      issuingCarrierAgent: extractFromLines("Issuing Carrier Agent", lines, ["Issuing Carrier"], { optional: true }),
      agentIataCode: extractFromLines("IATA Code", lines, ["IATA Code"], { optional: true }),
      accountNumber: extractFromLines("Account Number", lines, ["Account Number"], { optional: true }),
      airportDeparture: extractFromLines("Airport of Departure", lines, ["Airport of Departure", "Pickup Address"], { optional: true }),
      requestedRouting: extractFromLines("Requested Routing", lines, ["Requested Routing"], { optional: true }),
      airportDestination: extractFromLines("Destination", lines, ["Destination Airport", "Country of Destination"]),
      flightDate: extractFromLines("Flight Date", lines, ["Flight", "Pickup Date & Time"], { optional: true }),
      insuranceAmount: extractFromLines("Insurance Amount", lines, ["Insured Value", "Insurance Amount"], { optional: true }),
      handlingInfo: extractFromLines("Handling Info", lines, ["Handling Instructions"], { optional: true }),
      goodsDescription: (() => {
        const startIdx = lines.findIndex((l) => /(PROTO|TWX|Part\s*#)/i.test(l));
        if (startIdx === -1) return null;
        const block = [];
        for (let i = startIdx; i < lines.length; i++) {
          if (/^Total\s+(Weight|Invoice Value)|^I declare|^Signature|^Date:/i.test(lines[i])) break;
          block.push(lines[i]);
        }
        return block.join(" ").replace(/\s+/g, " ").trim();
      })(),
      weightCharge: extractFromLines("Weight Charge", lines, ["Weight Charge"], { optional: true }),
      otherCharges: extractFromLines("Other Charges", lines, ["Other Charges"], { optional: true }),
      totalPrepaid: extractFromLines("Total Prepaid", lines, ["Total Prepaid"], { optional: true }),
      totalCollect: extractFromLines("Total Collect", lines, ["Total Collect"], { optional: true }),
      currency: extractFromLines("Currency", lines, ["Currency Used", "Goods Value"])?.match(/[A-Z]{3}|USD|EUR|\$/)?.[0] || null,
      totalInvoiceValue: extractFromLines("Total Invoice Value", lines, ["Total Invoice Value", "Goods Value"]),
      totalWeight: text.match(/Total Weight\s*[:\-]?\s*([\d.,]+\s*(kg|KG))/i)?.[1] || 
                 (text.match(/Gross Weight.*?(\d+)\s*(kg)?/i)?.[1] ? text.match(/Gross Weight.*?(\d+)\s*(kg)?/i)[1] + " kg" : null),
      declaredCarriageValue: extractFromLines("Declared Carriage Value", lines, ["Declared Value for Carriage"], { optional: true }),
      declaredCustomsValue: extractFromLines("Declared Customs Value", lines, ["Declared Value for Customs"], { optional: true }),
      insuranceIfAny: extractFromLines("Insurance (if any)", lines, ["Amount of Insurance (if any)"], { optional: true }),
      incoterm: extractFromLines("Incoterm", lines, ["Incoterm", "Freight Terms"]),
      chargesCode: extractFromLines("Charges Code", lines, ["Charges Code"], { optional: true }),
      shipperSignature: signatureRaw?.replace(/^(Name:|Signature:)/i, "").trim(),
      jobTitle: extractFromLines("Job Title", lines, ["Job Title"], { optional: true }) || 
               (signatureRaw?.includes(",") ? signatureRaw?.split(",")[1]?.trim() : null),
      carrierSignature: extractFromLines("Carrier Signature", lines, ["Signature of Carrier"], { optional: true }),
      issueDate,
      issuePlace,
    };

    res.json({
      success: true,
      data: extracted
    });

  } catch (error) {
    console.error("Processing error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process document",
      details: error.message
    });
  }
});

// ====================== Server Setup ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Freight API running on port ${PORT}`));