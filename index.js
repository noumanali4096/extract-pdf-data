const express = require("express");
const pdf = require("html-pdf-node");

const cors = require("cors");
const fs = require("fs/promises");
const app = express();
app.use(express.json());
app.use(cors());

// Enhanced extraction functions for this specific format
function extractSection(text, sectionTitle) {
  const sectionRegex = new RegExp(
    `${sectionTitle}[\\s\\S]*?(?=(● [A-Za-z ]+:|\n\n|$))`,
    "i"
  );
  const match = text.match(sectionRegex);
  return match ? match[0] : null;
}

// function extractValueFromSection(section, key) {
//   if (!section) return null;
//   const regex = new RegExp(`● ${key}[\\s:]+([^●]+)`, "i");
//   const match = section.match(regex);
//   return match ? match[1].trim() : null;
// }

function extractValueFromSection(section, key) {
  if (!section) return null;
  const regex = new RegExp(`● ${key}[\\s:]+([^\n●]+)`, "i");  // stop at newline or bullet
  const match = section.match(regex);
  return match ? match[1].trim() : null;
}

function extractFlightInfo(text) {
  const flightSection = extractSection(text, "Flight Details");
  if (!flightSection) return {};

  const flightNumberMatch = flightSection.match(/Flight ([A-Z0-9]+)/i);
  const departureMatch = flightSection.match(
    /Departure: (\d{2}\.\d{2}\.\d{4} \d{2}:\d{2})/i
  );
  const routingMatch = flightSection.match(/Routing\/Destination: ([^●]+)/i);

  return {
    flightNumber: flightNumberMatch ? flightNumberMatch[1] : null,
    departureDateTime: departureMatch ? departureMatch[1] : null,
    routing: routingMatch ? routingMatch[1].trim() : null,
  };
}

function extractFinancials(text) {
  const financialsSection = extractSection(text, "Financials");
  if (!financialsSection) return {};

  const amountRegex = /([€$£]?[\d,]+\.?\d*)/g;

  return {
    insuranceAmount: extractValueFromSection(
      financialsSection,
      "Amount of Insurance"
    ),
    currency: extractValueFromSection(financialsSection, "Currency"),
    declaredValueCarriage: extractValueFromSection(
      financialsSection,
      "Declared Value \\(Carriage\\)"
    ),
    declaredValueCustoms: extractValueFromSection(
      financialsSection,
      "Declared Value \\(Customs\\)"
    ),
    weightCharge: extractValueFromSection(financialsSection, "Weight Charge"),
    otherCharges: extractValueFromSection(financialsSection, "Other Charges"),
    totalPrepaid: extractValueFromSection(financialsSection, "Total Prepaid"),
    totalCollect: extractValueFromSection(financialsSection, "Total Collect"),
  };
}

function extractCargoSpecs(text) {
  const cargoSection = extractSection(text, "Cargo Specifications");
  if (!cargoSection) return {};

  const weightMatch = cargoSection.match(/Gross Weight: ([\d.]+) (\w+)/i);
  const chargeableWeightMatch = cargoSection.match(
    /Chargeable Weight: ([\d.]+ \w+)/i
  );
  const piecesMatch = cargoSection.match(/No\. of Pieces: ([\d]+ \w+)/i);

  return {
    handlingInfo: extractValueFromSection(cargoSection, "Handling Information"),
    numberOfPieces: piecesMatch ? piecesMatch[1] : null,
    grossWeight: weightMatch ? `${weightMatch[1]} ${weightMatch[2]}` : null,
    chargeableWeight: chargeableWeightMatch ? chargeableWeightMatch[1] : null,
    goodsDescription: extractValueFromSection(
      cargoSection,
      "Nature/Quantity of Goods"
    ),
  };
}

app.post("/extract-freight", (req, res) => {
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
      awbNumber: extractValueFromSection(text, "AWB Number"),
      shipperInfo: extractValueFromSection(text, "Shipper's Name/Address"),
      consigneeInfo: extractValueFromSection(text, "Consignee's Name/Address"),
      departureAirport: extractValueFromSection(text, "Airport of Departure"),
      destinationAirport: extractValueFromSection(
        text,
        "Airport of Destination"
      ),
      requestedFlight: extractValueFromSection(text, "Requested Flight/Date"),

      // Flight Details
      flightNumber: extractValueFromSection(text, "Flight Number"),
      departureDateTime: extractValueFromSection(text, "Departure Date/Time"),
      routing: extractValueFromSection(text, "Routing/Destination"),

      // Financials
      insuranceAmount: extractValueFromSection(text, "Amount of Insurance"),
      currency: extractValueFromSection(text, "Currency"),
      declaredValueCarriage: extractValueFromSection(
        text,
        "Declared Value \\(Carriage\\)"
      ),
      declaredValueCustoms: extractValueFromSection(
        text,
        "Declared Value \\(Customs\\)"
      ),
      weightCharge: extractValueFromSection(text, "Weight Charge"),
      otherCharges: extractValueFromSection(text, "Other Charges"),
      totalPrepaid: extractValueFromSection(text, "Total Prepaid"),
      totalCollect: extractValueFromSection(text, "Total Collect"),

      // Cargo Specifications
      handlingInfo: extractValueFromSection(text, "Handling Information"),
      numberOfPieces: extractValueFromSection(text, "No. of Pieces"),
      grossWeight: extractValueFromSection(text, "Gross Weight"),
      chargeableWeight: extractValueFromSection(text, "Chargeable Weight"),
      goodsDescription: extractValueFromSection(
        text,
        "Nature/Quantity of Goods"
      ),
      byFirstCarrier: extractValueFromSection(text, "By First Carrier"),
    };

    res.json({
      success: true,
      data: extractedData,
    });
  } catch (error) {
    console.error("Processing error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process document",
      details: error.message,
    });
  }
});

app.post("/generate-pdf", async (req, res) => {
  console.log("Received body:", req.body);
  try {
    let html = await fs.readFile("./AWB.html", "utf8");

    const keys = [
      "awbNumber",
      "shipperName",
      "shipperAccountNumber",
      "consigneeName",
      "consigneeAccountNumber",
      "agentName",
      "agentIATACode",
      "agentAccountNumber",
      "departure",
      "destination",
      "byFirstCarrier",
      "requestedFlightDate",
      "currency",
      "declaredCarriageValue",
      "declaredCustomsValue",
      "insuranceAmount",
      "handlingInformation",
      "sciValue",
      "noOfPieces",
      "grossWeightValue",
      "grossWeightUnitValue",
      "chargeableWeightValue",
      "rateChargeValue",
      "totalValue",
      "quantityOfGoodsValue",
      "weightChargePrepaidValue",
      "weightChargeCollectValue",
      "shipperSignatureValue",
      "carrierSignatureValue",
      "valuationChargePrepaidValue",
      "valuationChargeCollectValue",
      "taxPrepaidValue",
      "taxCollectValue",
      "prepaidChargesByAgent",
      "collectChargesByAgent",
      "prepaidChargesByCarrier",
      "collectChargesByCarrier",
      "totalPrepaidCharges",
      "totalCollectCharges",
      "issuePlace",
      "issueDate",
    ];

    for (const key of keys) {
      const val = req.body?.[key] ?? "";
      html = html.replace(new RegExp(`{{${key}}}`, "g"), val);
    }

    const file = { content: html };
    const options = {
      format: 'A4',
      printBackground: true
    };
    const pdfBuffer = await pdf.generatePdf(file, options);
    // const fileName = req.body?.fileName ? `${req.body.fileName}.pdf` : 'awb.pdf';

    const rawFileName = req.body?.fileName?.trim() || "default-name";
    const finalFileName = `AWB-${rawFileName}.pdf`;
    // await fs.writeFile(`./${fileName}`, pdfBuffer);
    await fs.writeFile(`./${finalFileName}`, pdfBuffer);
    

    res.setHeader("Content-Type", "application/pdf");
    // res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.setHeader("Content-Disposition", `inline; filename="${finalFileName}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Full PDF generation error:", { message: err.message });
    res
      .status(500)
      .json({ error: "PDF generation failed", details: err.message });
  }
});

// Add this endpoint to your existing Express app

app.post('/transform-awb-stock', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Body text is required" });
    }

    // Skip header row and process data
    const transformedData = text.slice(1).map(row => {
      // Convert dates to ISO format (compatible with Bubble)
      const issueDate = row.Column4 ? new Date(row.Column4).toISOString() : null;
      const usedDate = row.Column6 ? new Date(row.Column6).toISOString() : null;

      return {
        // Basic AWB Information
        awbNumber: row.Column0 || null,
        airline: {
          code: row.Column1 || null,
          name: row.Column2 || null
        },
        agent: {
          code: row.Column3 || null,
        },
        
        // Dates
        dates: {
          issue: issueDate,
          used: usedDate,
          // Add additional date fields if needed
        },
        
        // Status Information
        status: {
          current: row.Column5 || 'Unknown',
          previous: null, // Can be populated for history tracking
        },
        
        // Allocation Details
        allocation: {
          batch: row.Column7 || null,
          rangeType: row.Column8 || 'Normal',
          notes: null // Optional field for future use
        },
        
        // System Metadata
        metadata: {
          source: 'PDF.co Excel Import',
          importedAt: new Date().toISOString(),
          processedBy: 'AWB Stock Processor',
          version: '1.0'
        },
        
        // Compatibility with your existing freight data structure
        flightInfo: null, // Can be populated later
        financials: null, // Can be populated later
        cargoSpecs: null  // Can be populated later
      };
    });

    // Generate statistics
    const statusCounts = transformedData.reduce((acc, item) => {
      acc[item.status.current] = (acc[item.status.current] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: transformedData,
      stats: {
        totalRecords: transformedData.length,
        statusCounts,
        airlines: [...new Set(transformedData.map(x => x.airline.code))],
        dateRange: {
          earliest: transformedData.reduce((min, item) => 
            item.dates.issue && (!min || item.dates.issue < min) ? item.dates.issue : min, null),
          latest: transformedData.reduce((max, item) => 
            item.dates.issue && (!max || item.dates.issue > max) ? item.dates.issue : max, null)
        }
      }
    });

  } catch (error) {
    console.error('AWB Stock Transformation error:', error);
    res.status(500).json({
      success: false,
      error: "AWB Stock data transformation failed",
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Freight API V2 running on port ${PORT}`));