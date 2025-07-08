const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const puppeteer = require("puppeteer")
const fs = require("fs/promises");
const app = express();
app.use(bodyParser.json());
app.use(cors());

// Enhanced extraction functions for this specific format
function extractSection(text, sectionTitle) {
  const sectionRegex = new RegExp(`${sectionTitle}[\\s\\S]*?(?=(● [A-Za-z ]+:|\n\n|$))`, 'i');
  const match = text.match(sectionRegex);
  return match ? match[0] : null;
}

function extractValueFromSection(section, key) {
  if (!section) return null;
  const regex = new RegExp(`● ${key}[\\s:]+([^●]+)`, 'i');
  const match = section.match(regex);
  return match ? match[1].trim() : null;
}

function extractFlightInfo(text) {
  const flightSection = extractSection(text, 'Flight Details');
  if (!flightSection) return {};

  const flightNumberMatch = flightSection.match(/Flight ([A-Z0-9]+)/i);
  const departureMatch = flightSection.match(/Departure: (\d{2}\.\d{2}\.\d{4} \d{2}:\d{2})/i);
  const routingMatch = flightSection.match(/Routing\/Destination: ([^●]+)/i);

  return {
    flightNumber: flightNumberMatch ? flightNumberMatch[1] : null,
    departureDateTime: departureMatch ? departureMatch[1] : null,
    routing: routingMatch ? routingMatch[1].trim() : null
  };
}

function extractFinancials(text) {
  const financialsSection = extractSection(text, 'Financials');
  if (!financialsSection) return {};

  const amountRegex = /([€$£]?[\d,]+\.?\d*)/g;

  return {
    insuranceAmount: extractValueFromSection(financialsSection, 'Amount of Insurance'),
    currency: extractValueFromSection(financialsSection, 'Currency'),
    declaredValueCarriage: extractValueFromSection(financialsSection, 'Declared Value \\(Carriage\\)'),
    declaredValueCustoms: extractValueFromSection(financialsSection, 'Declared Value \\(Customs\\)'),
    weightCharge: extractValueFromSection(financialsSection, 'Weight Charge'),
    otherCharges: extractValueFromSection(financialsSection, 'Other Charges'),
    totalPrepaid: extractValueFromSection(financialsSection, 'Total Prepaid'),
    totalCollect: extractValueFromSection(financialsSection, 'Total Collect')
  };
}

function extractCargoSpecs(text) {
  const cargoSection = extractSection(text, 'Cargo Specifications');
  if (!cargoSection) return {};

  const weightMatch = cargoSection.match(/Gross Weight: ([\d.]+) (\w+)/i);
  const chargeableWeightMatch = cargoSection.match(/Chargeable Weight: ([\d.]+ \w+)/i);
  const piecesMatch = cargoSection.match(/No\. of Pieces: ([\d]+ \w+)/i);

  return {
    handlingInfo: extractValueFromSection(cargoSection, 'Handling Information'),
    numberOfPieces: piecesMatch ? piecesMatch[1] : null,
    grossWeight: weightMatch ? `${weightMatch[1]} ${weightMatch[2]}` : null,
    chargeableWeight: chargeableWeightMatch ? chargeableWeightMatch[1] : null,
    goodsDescription: extractValueFromSection(cargoSection, 'Nature/Quantity of Goods')
  };
}

app.post('/extract-freight', (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "OCR text is required" });
    }

    const flightInfo = extractFlightInfo(text);
    const financials = extractFinancials(text);
    const cargoSpecs = extractCargoSpecs(text);

    // const extractedData = {
    //   awbNumber: extractValueFromSection(text, 'AWB Number'),
    //   shipperInfo: extractValueFromSection(text, 'Shipper\'s Name/Address'),
    //   consigneeInfo: extractValueFromSection(text, 'Consignee\'s Name/Address'),
    //   departureAirport: extractValueFromSection(text, 'Airport of Departure'),
    //   destinationAirport: extractValueFromSection(text, 'Airport of Destination'),
    //   requestedFlight: extractValueFromSection(text, 'Requested Flight/Date'),
    //   ...flightInfo,
    //   ...financials,
    //   ...cargoSpecs
    // };
    const extractedData = {
      // Basic Information
      awbNumber: extractValueFromSection(text, 'AWB Number'),
      shipperInfo: extractValueFromSection(text, 'Shipper\'s Name/Address'),
      consigneeInfo: extractValueFromSection(text, 'Consignee\'s Name/Address'),
      departureAirport: extractValueFromSection(text, 'Airport of Departure'),
      destinationAirport: extractValueFromSection(text, 'Airport of Destination'),
      requestedFlight: extractValueFromSection(text, 'Requested Flight/Date'),

      // Flight Details
      flightNumber: extractValueFromSection(text, 'Flight Number'),
      departureDateTime: extractValueFromSection(text, 'Departure Date/Time'),
      routing: extractValueFromSection(text, 'Routing/Destination'),

      // Financials
      insuranceAmount: extractValueFromSection(text, 'Amount of Insurance'),
      currency: extractValueFromSection(text, 'Currency'),
      declaredValueCarriage: extractValueFromSection(text, 'Declared Value \\(Carriage\\)'),
      declaredValueCustoms: extractValueFromSection(text, 'Declared Value \\(Customs\\)'),
      weightCharge: extractValueFromSection(text, 'Weight Charge'),
      otherCharges: extractValueFromSection(text, 'Other Charges'),
      totalPrepaid: extractValueFromSection(text, 'Total Prepaid'),
      totalCollect: extractValueFromSection(text, 'Total Collect'),

      // Cargo Specifications
      handlingInfo: extractValueFromSection(text, 'Handling Information'),
      numberOfPieces: extractValueFromSection(text, 'No. of Pieces'),
      grossWeight: extractValueFromSection(text, 'Gross Weight'),
      chargeableWeight: extractValueFromSection(text, 'Chargeable Weight'),
      goodsDescription: extractValueFromSection(text, 'Nature/Quantity of Goods')
    };

    res.json({
      success: true,
      data: extractedData
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

app.post("/generate-pdf", async (req, res) => {
  let browser;
  try {
    let html = await fs.readFile("./AWB.html", "utf8");
    html = html.replace("shipperName", req.body.shipperName ?? "");
    html = html.replace("shipperAccountNumber", req.body.shipperAccountNumber ?? "");
    html = html.replace("consigneeName", req.body.consigneeName ?? "");
    html = html.replace("consigneeAccountNumber", req.body.consigneeAccountNumber ?? "");
    html = html.replace("agentName", req.body.agentName ?? "");
    html = html.replace("agentIATACode", req.body.agentIATACode ?? "");
    html = html.replace("agentAccountNumber", req.body.agentAccountNumber ?? "");
    html = html.replace("departure", req.body.departure ?? "");
    html = html.replace("destination", req.body.destination ?? "");


    html = html.replace("byFirstCarrier", req.body.byFirstCarrier ?? "");
    html = html.replace("requestedFlightDate", req.body.requestedFlightDate ?? "");
    html = html.replace("currency", req.body.currency ?? "");
    html = html.replace("declaredCarriageValue", req.body.declaredCarriageValue ?? "");
    html = html.replace("declaredCustomsValue", req.body.declaredCustomsValue ?? "");
    html = html.replace("insuranceAmount", req.body.insuranceAmount ?? "");
    html = html.replace("handlingInformation", req.body.handlingInformation ?? "");
    html = html.replace("sciValue", req.body.sciValue ?? "");
    html = html.replace("noOfPieces", req.body.noOfPieces ?? "");
    html = html.replace("grossWeightValue", req.body.grossWeightValue ?? "");
    html = html.replace("grossWeightUnitValue", req.body.grossWeightUnitValue ?? "");
    html = html.replace("chargeableWeightValue", req.body.chargeableWeightValue ?? "");

    html = html.replace("rateChargeValue", req.body.rateChargeValue ?? "");
    html = html.replace("totalValue", req.body.totalValue ?? "");
    html = html.replace("quantityOfGoodsValue", req.body.quantityOfGoodsValue);
    html = html.replace("weightChargePrepaidValue", req.body.weightChargePrepaidValue ?? "");
    html = html.replace("weightChargeCollectValue", req.body.weightChargeCollectValue ?? "");
    html = html.replace("chargeableWeightValue", req.body.chargeableWeightValue ?? "");

    html = html.replace("shipperSignatureValue", req.body.shipperSignatureValue ?? "");
    html = html.replace("carrierSignatureValue", req.body.carrierSignatureValue ?? "");


    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",  // Important for cloud environments
        "--single-process"          // May be needed for Render.com
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
    });

    const page = await browser.newPage();

    // Set viewport to fit wide layout
    await page.setViewport({ width: 1600, height: 1000 });

    // Load content
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      landscape: false,
    });

    // await browser.close();
    // fs.writeFile("./awb.pdf", pdfBuffer)
    try {
      await fs.writeFile("./awb.pdf", pdfBuffer);
    } catch (writeErr) {
      console.error("Warning: Failed to save PDF copy:", writeErr);
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="awb.pdf"'); // for download4

    res.send(pdfBuffer);

    // res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({
      error: "PDF generation failed",
      details: err.message,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
    });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Freight API V2 running on port ${PORT}`));