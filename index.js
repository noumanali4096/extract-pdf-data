const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// ====================== Extraction Functions ======================
function extractValue(lines, label) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(label)) {
      // Split on bullet point or colon
      const parts = lines[i].split(/[●:]/);
      if (parts.length > 1) return parts[1].trim();
      
      // If no delimiter found, try next line
      if (i + 1 < lines.length) return lines[i + 1].trim();
    }
  }
  return null;
}

function extractAddress(lines, label) {
  const idx = lines.findIndex(line => line.includes(label));
  if (idx === -1) return null;
  
  // Address is typically the next line
  if (idx + 1 < lines.length) {
    return lines[idx + 1].trim();
  }
  return null;
}

function extractSection(lines, startLabel, endLabel) {
  const startIdx = lines.findIndex(line => line.includes(startLabel));
  if (startIdx === -1) return [];
  
  let endIdx = lines.length;
  if (endLabel) {
    endIdx = lines.findIndex((line, i) => i > startIdx && line.includes(endLabel));
    if (endIdx === -1) endIdx = lines.length;
  }
  
  return lines.slice(startIdx, endIdx);
}

// ====================== API Endpoint ======================
app.post('/extract-freight', (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "OCR text is required" });
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Basic Information
    const basicInfo = extractSection(lines, "Basic Information:", "Flight Details:");
    const awbNumber = extractValue(basicInfo, "AWB Number");
    const shipperNameAndAddress = extractAddress(basicInfo, "Shipper's Name/Address");
    const consigneeNameAndAddress = extractAddress(basicInfo, "Consignee's Name/Address");

    // Flight Details
    const flightDetails = extractSection(lines, "Flight Details:", "Financials:");
    const airportDeparture = extractValue(flightDetails, "Airport of Departure");
    const firstCarrier = extractValue(flightDetails, "By First Carrier");
    const routing = extractValue(flightDetails, "Routing/Destination");
    const airportDestination = extractValue(flightDetails, "Airport of Destination");
    const requestedFlight = extractValue(flightDetails, "Requested Flight/Date");

    // Financials
    const financials = extractSection(lines, "Financials:", "Cargo Specifications:");
    const insuranceAmount = extractValue(financials, "Amount of Insurance");
    const currency = extractValue(financials, "Currency");
    const declaredCarriageValue = extractValue(financials, "Declared Value (Carriage)");
    const declaredCustomsValue = extractValue(financials, "Declared Value (Customs)");
    const weightCharge = extractValue(financials, "Weight Charge");
    const otherCharges = extractValue(financials, "Other Charges");
    const totalPrepaid = extractValue(financials, "Total Prepaid");
    const totalCollect = extractValue(financials, "Total Collect");

    // Cargo Specifications
    const cargoSpecs = extractSection(lines, "Cargo Specifications:");
    const handlingInfo = extractValue(cargoSpecs, "Handling Information");
    const noOfPieces = extractValue(cargoSpecs, "No. of Pieces");
    const grossWeight = extractValue(cargoSpecs, "Gross Weight");
    const weightUnit = extractValue(cargoSpecs, "Weight Unit");
    const chargeableWeight = extractValue(cargoSpecs, "Chargeable Weight");
    const natureOfGoods = extractValue(cargoSpecs, "Nature/Quantity of Goods");

    const extracted = {
      awbNumber,
      shipperNameAndAddress,
      consigneeNameAndAddress,
      airportDeparture,
      firstCarrier,
      routing,
      airportDestination,
      requestedFlight,
      insuranceAmount,
      currency,
      declaredCarriageValue,
      declaredCustomsValue,
      weightCharge,
      otherCharges,
      totalPrepaid,
      totalCollect,
      handlingInfo,
      noOfPieces,
      grossWeight,
      weightUnit,
      chargeableWeight,
      natureOfGoods,
      // Fields not in your document
      poNumber: null,
      invoiceNumber: null,
      importerInfo: null,
      issuingCarrierAgent: null,
      agentIataCode: null,
      accountNumber: null,
      incoterm: null,
      chargesCode: null,
      shipperSignature: null,
      jobTitle: null,
      carrierSignature: null,
      issueDate: null,
      issuePlace: null
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