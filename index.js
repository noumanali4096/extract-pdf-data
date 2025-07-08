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
        const value = lines[i].split(/[:\-●]/)[1] || lines[i + 1];
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
  
  let address = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith('●') || lines[i].trim() === '') break;
    address.push(lines[i].trim());
  }
  return address.join(", ") || null;
}

function extractFlightDetails(lines) {
  const flightDetails = {};
  const startIdx = lines.findIndex(line => 
    line.toLowerCase().includes('flight details')
  );
  
  if (startIdx === -1) return null;
  
  const flightBlock = lines.slice(startIdx);
  
  flightDetails.airportDeparture = extractFromLines("Airport of Departure", flightBlock, ["Airport of Departure"]);
  flightDetails.firstCarrier = extractFromLines("First Carrier", flightBlock, ["By First Carrier"]);
  flightDetails.routing = extractFromLines("Routing/Destination", flightBlock, ["Routing/Destination"]);
  flightDetails.airportDestination = extractFromLines("Airport of Destination", flightBlock, ["Airport of Destination"]);
  flightDetails.requestedFlight = extractFromLines("Requested Flight", flightBlock, ["Requested Flight/Date"]);
  
  return flightDetails;
}

function extractFinancials(lines) {
  const financials = {};
  const startIdx = lines.findIndex(line => 
    line.toLowerCase().includes('financials')
  );
  
  if (startIdx === -1) return null;
  
  const financialBlock = lines.slice(startIdx);
  
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

function extractCargoSpecs(lines) {
  const cargoSpecs = {};
  const startIdx = lines.findIndex(line => 
    line.toLowerCase().includes('cargo specifications')
  );
  
  if (startIdx === -1) return null;
  
  const cargoBlock = lines.slice(startIdx);
  
  cargoSpecs.handlingInfo = extractFromLines("Handling Information", cargoBlock, ["Handling Information"]);
  cargoSpecs.noOfPieces = extractFromLines("No. of Pieces", cargoBlock, ["No. of Pieces"]);
  cargoSpecs.grossWeight = extractFromLines("Gross Weight", cargoBlock, ["Gross Weight"]);
  cargoSpecs.weightUnit = extractFromLines("Weight Unit", cargoBlock, ["Weight Unit"]);
  cargoSpecs.chargeableWeight = extractFromLines("Chargeable Weight", cargoBlock, ["Chargeable Weight"]);
  cargoSpecs.natureOfGoods = extractFromLines("Nature/Quantity of Goods", cargoBlock, ["Nature/Quantity of Goods"]);
  
  return cargoSpecs;
}

// ====================== API Endpoint ======================
app.post('/extract-freight', (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: "OCR text is required" });
    }

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    
    // Extract flight details
    const flightDetails = extractFlightDetails(lines) || {};
    
    // Extract financials
    const financials = extractFinancials(lines) || {};
    
    // Extract cargo specifications
    const cargoSpecs = extractCargoSpecs(lines) || {};

    const extracted = {
      awbNumber: extractFromLines("AWB Number", lines, ["AWB Number"]),
      shipperNameAndAddress: extractAddressBlock(lines, "Shipper's Name/Address"),
      consigneeNameAndAddress: extractAddressBlock(lines, "Consignee's Name/Address"),
      airportDeparture: flightDetails.airportDeparture,
      firstCarrier: flightDetails.firstCarrier,
      routing: flightDetails.routing,
      airportDestination: flightDetails.airportDestination,
      requestedFlight: flightDetails.requestedFlight,
      insuranceAmount: financials.insuranceAmount,
      currency: financials.currency,
      declaredCarriageValue: financials.declaredCarriageValue,
      declaredCustomsValue: financials.declaredCustomsValue,
      weightCharge: financials.weightCharge,
      otherCharges: financials.otherCharges,
      totalPrepaid: financials.totalPrepaid,
      totalCollect: financials.totalCollect,
      handlingInfo: cargoSpecs.handlingInfo,
      noOfPieces: cargoSpecs.noOfPieces,
      grossWeight: cargoSpecs.grossWeight,
      weightUnit: cargoSpecs.weightUnit,
      chargeableWeight: cargoSpecs.chargeableWeight,
      natureOfGoods: cargoSpecs.natureOfGoods,
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