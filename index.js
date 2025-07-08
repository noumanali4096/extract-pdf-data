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
        // Updated to handle bullet points (●) and colons
        const parts = lines[i].split(/[:\-●]/);
        const value = parts.slice(1).join(':').trim() || lines[i + 1];
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
  
  const group = [];
  // Collect all lines until next section or empty line
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '' || 
        lines[i].toLowerCase().includes('flight details:') ||
        lines[i].toLowerCase().includes('financials:') ||
        lines[i].toLowerCase().includes('cargo specifications:')) {
      break;
    }
    group.push(lines[i]);
  }
  
  return (
    keys
      .map((k) => {
        const l = group.find((line) =>
          line.toLowerCase().includes(k.toLowerCase())
        );
        return l?.split(/[:#●]/)[1]?.trim();
      })
      .filter(Boolean)
      .join(", ") || null
  );
}

function extractAddressBlock(lines, label) {
  const idx = lines.findIndex((line) =>
    line.toLowerCase().includes(label.toLowerCase())
  );
  if (idx === -1) return null;
  
  // Get the immediate next line as the address
  if (idx + 1 < lines.length && !lines[idx + 1].trim().startsWith('●')) {
    return lines[idx + 1].trim();
  }
  return null;
}

function extractFlightDetails(lines) {
  const flightDetails = {};
  const startIdx = lines.findIndex(line => 
    line.toLowerCase().includes('flight details')
  );
  
  if (startIdx === -1) return flightDetails;
  
  const flightBlock = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '' || lines[i].toLowerCase().includes('financials:')) break;
    flightBlock.push(lines[i]);
  }

  flightDetails.airportDeparture = extractFromLines("Airport of Departure", flightBlock, ["Airport of Departure"]);
  flightDetails.requestedRouting = extractFromLines("Requested Routing", flightBlock, ["Routing/Destination"]);
  flightDetails.airportDestination = extractFromLines("Airport of Destination", flightBlock, ["Airport of Destination"]);
  flightDetails.flightDate = extractFromLines("Flight Date", flightBlock, ["Requested Flight/Date", "Departure"]);
  
  return flightDetails;
}

function extractFinancialInfo(lines) {
  const financials = {};
  const startIdx = lines.findIndex(line => 
    line.toLowerCase().includes('financials')
  );
  
  if (startIdx === -1) return financials;
  
  const financialBlock = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '' || lines[i].toLowerCase().includes('cargo specifications:')) break;
    financialBlock.push(lines[i]);
  }

  financials.insuranceAmount = extractFromLines("Insurance Amount", financialBlock, ["Amount of Insurance"]);
  financials.currency = extractFromLines("Currency", financialBlock, ["Currency"]);
  financials.declaredCarriageValue = extractFromLines("Declared Carriage Value", financialBlock, ["Declared Value (Carriage)"]);
  financials.declaredCustomsValue = extractFromLines("Declared Customs Value", financialBlock, ["Declared Value (Customs)"]);
  financials.weightCharge = extractFromLines("Weight Charge", financialBlock, ["Weight Charge"]);
  financials.otherCharges = extractFromLines("Other Charges", financialBlock, ["Other Charges"]);
  financials.totalPrepaid = extractFromLines("Total Prepaid", financialBlock, ["Total Prepaid"]);
  financials.totalCollect = extractFromLines("Total Collect", financialBlock, ["Total Collect"]);
  
  return financials;
}

function extractCargoInfo(lines) {
  const cargoInfo = {};
  const startIdx = lines.findIndex(line => 
    line.toLowerCase().includes('cargo specifications')
  );
  
  if (startIdx === -1) return cargoInfo;
  
  const cargoBlock = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === '') break;
    cargoBlock.push(lines[i]);
  }

  cargoInfo.handlingInfo = extractFromLines("Handling Info", cargoBlock, ["Handling Information"]);
  cargoInfo.noOfPieces = extractFromLines("No. of Pieces", cargoBlock, ["No. of Pieces"]);
  cargoInfo.grossWeight = extractFromLines("Gross Weight", cargoBlock, ["Gross Weight"]);
  cargoInfo.weightUnit = extractFromLines("Weight Unit", cargoBlock, ["Weight Unit"]);
  cargoInfo.chargeableWeight = extractFromLines("Chargeable Weight", cargoBlock, ["Chargeable Weight"]);
  cargoInfo.natureOfGoods = extractFromLines("Nature of Goods", cargoBlock, ["Nature/Quantity of Goods"]);
  
  return cargoInfo;
}

// ====================== API Endpoint ======================
app.post('/extract-freight', (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "OCR text is required" });
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    // Extract basic information
    const awbNumber = extractFromLines("AWB Number", lines, ["AWB Number"]);
    const shipperNameAndAddress = extractAddressBlock(lines, "Shipper's Name/Address") || 
                                 extractGroupedBlock(lines, "Shipper/Exporter", ["Name", "Address"]);
    const consigneeNameAndAddress = extractAddressBlock(lines, "Consignee's Name/Address") || 
                                   extractGroupedBlock(lines, "Consignee/Delivery", ["Name", "Address"]);
    
    // Extract other sections
    const flightDetails = extractFlightDetails(lines);
    const financials = extractFinancialInfo(lines);
    const cargoInfo = extractCargoInfo(lines);

    const extracted = {
      awbNumber,
      shipperNameAndAddress,
      consigneeNameAndAddress,
      airportDeparture: flightDetails.airportDeparture,
      requestedRouting: flightDetails.requestedRouting,
      airportDestination: flightDetails.airportDestination,
      flightDate: flightDetails.flightDate,
      insuranceAmount: financials.insuranceAmount,
      currency: financials.currency,
      declaredCarriageValue: financials.declaredCarriageValue,
      declaredCustomsValue: financials.declaredCustomsValue,
      weightCharge: financials.weightCharge,
      otherCharges: financials.otherCharges,
      totalPrepaid: financials.totalPrepaid,
      totalCollect: financials.totalCollect,
      handlingInfo: cargoInfo.handlingInfo,
      noOfPieces: cargoInfo.noOfPieces,
      grossWeight: cargoInfo.grossWeight,
      weightUnit: cargoInfo.weightUnit,
      chargeableWeight: cargoInfo.chargeableWeight,
      natureOfGoods: cargoInfo.natureOfGoods,
      // These fields will be null in the new format
      poNumber: null,
      invoiceNumber: null,
      importerInfo: null,
      issuingCarrierAgent: null,
      agentIataCode: null,
      accountNumber: null,
      goodsDescription: cargoInfo.natureOfGoods, // Map nature of goods to description
      totalInvoiceValue: financials.insuranceAmount, // Map insurance amount as fallback
      totalWeight: cargoInfo.grossWeight,
      insuranceIfAny: financials.insuranceAmount,
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