import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Exports data to an Excel file
 * @param {Array} data - Array of objects to export
 * @param {Object} columns - Map of field keys to header names (e.g., { first_name: "First Name" })
 * @param {String} filename - Name of the file (without extension)
 */
export const exportToExcel = (data, columns, filename) => {
  if (!data || !data.length) {
    console.warn("No data to export");
    return;
  }

  // Transform data based on columns
  const formattedData = data.map(item => {
    const row = {};
    Object.keys(columns).forEach(key => {
      // Handle nested properties (e.g., 'group.name')
      let value = item;
      const parts = key.split('.');
      for (const part of parts) {
        value = value ? value[part] : '';
      }
      
      // Handle specific value types (boolean, dates) if needed, 
      // but XLSX handles most well. 
      // Add custom formatting logic here if required.
      
      row[columns[key]] = value;
    });
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  
  // Auto-width columns
  const wscols = Object.keys(formattedData[0] || {}).map(key => {
    const maxLen = Math.max(
      ...formattedData.map(row => String(row[key] || '').length),
      String(key).length
    );
    return { wch: maxLen + 5 }; // +5 padding
  });
  worksheet['!cols'] = wscols;
  
  // Write to buffer and create blob
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  
  // Use specific MIME type for Excel
  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([excelBuffer], { type: mimeType });
  
  downloadBlob(blob, `${filename}.xlsx`, mimeType);
};

/**
 * Helper function to handle file downloads safely across devices
 * @param {Blob} blob 
 * @param {String} filename 
 * @param {String} mimeType
 */
export const downloadBlob = (blob, filename, mimeType = 'application/octet-stream') => {
  // Try Web Share API first (Mobile friendly)
  // Note: Requires HTTPS or localhost. Might fail on HTTP 192.168...
  // Check if running on mobile device
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  if (isMobile && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: mimeType });
      if (navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: filename,
          text: 'Exported file'
        }).catch(err => {
          if (err.name !== 'AbortError') {
            console.warn('Share failed, falling back to manual download', err);
            triggerManualDownload(blob, filename);
          }
        });
        return;
      }
    } catch (e) {
      console.warn('Share API setup failed, falling back', e);
    }
  }

  triggerManualDownload(blob, filename);
};

const triggerManualDownload = (blob, filename) => {
  // IE/Edge
  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  
  // Mobile Safari/WebView tweaks
  link.target = "_blank"; // Safer for mobile downloads
  document.body.appendChild(link);
  
  try {
    link.click();
  } catch (e) {
    console.error("Download failed via click()", e);
  }

  // Cleanup
  setTimeout(() => {
    try {
      if (document.body.contains(link)) {
        document.body.removeChild(link);
      }
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.warn("Cleanup failed:", e);
    }
  }, 1000);
};

// Font cache to prevent repeated fetches
let cachedFont = null;

// Helper to load font with fallback paths
export const loadFont = async (filename) => {
  if (cachedFont) return cachedFont;

  const paths = [
    `/fonts/${filename}`,
    `fonts/${filename}`,
    `${window.location.origin}/fonts/${filename}`
  ];

  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (!response.ok) continue;
      
      const buffer = await response.arrayBuffer();
      // Convert to base64
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const len = bytes.byteLength;
      for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
      }
      const result = window.btoa(binary);
      cachedFont = result; // Cache the result
      return result;
    } catch (e) {
      console.warn(`Failed to load font from ${path}`, e);
    }
  }
  
  console.error(`Could not load font ${filename} from any path`);
  return null;
};

/**
 * Exports data to a PDF file with landscape orientation support
 * @param {Array} data - Array of objects to export
 * @param {Object} columns - Map of field keys to header names
 * @param {String} filename - Name of the file (without extension)
 * @param {String} title - Title to display at the top of the PDF
 */
export const exportToPDF = async (data, columns, filename, title = '', footer = null, orientation = 'landscape') => {
  try {
    if (!data || !data.length) {
      console.warn("No data to export");
      return;
    }

    const doc = new jsPDF({ orientation });
    
    // Load Cyrillic font
    const fontBase64 = await loadFont('Arial-Regular.ttf');
    let fontName = 'helvetica';
    
    if (fontBase64) {
        doc.addFileToVFS('Arial-Regular.ttf', fontBase64);
        doc.addFont('Arial-Regular.ttf', 'Arial', 'normal');
        doc.setFont('Arial');
        fontName = 'Arial';
    } else {
        console.warn("Using fallback font (Cyrillic might not be supported)");
        // Try to alert user if Cyrillic is likely present
        const hasCyrillic = JSON.stringify(data).match(/[а-яА-ЯёЁ]/);
        if (hasCyrillic) {
           console.error("Cyrillic content detected but font failed to load");
        }
    }
    
    // Add title
    if (title) {
      doc.setFontSize(18);
      try {
        doc.text(title, 14, 22);
      } catch (e) {
        console.warn("Error adding title to PDF:", e);
      }
    }
    
    // Prepare table headers and body
    const headers = [Object.values(columns)];
    const body = data.map(item => {
      return Object.keys(columns).map(key => {
        // Handle nested properties
        let value = item;
        const parts = key.split('.');
        for (const part of parts) {
          value = value ? value[part] : '';
        }
        return value;
      });
    });

    // Use imported autoTable
    autoTable(doc, {
      head: headers,
      body: body,
      startY: title ? 30 : 20,
      styles: { 
          fontSize: 8,
          font: fontName,
          fontStyle: 'normal'
      },
      headStyles: { fillColor: [234, 179, 8] }, // brand-yellow equivalent roughly
      didDrawPage: function (data) {
        if (footer) {
            footer(doc, data);
        }
      }
    });

    // Save using blob method for consistency
    const pdfBlob = doc.output('blob');
    
    // Use specific MIME type for PDF
    const mimeType = 'application/pdf';
    const finalBlob = new Blob([pdfBlob], { type: mimeType });
    downloadBlob(finalBlob, `${filename}.pdf`, mimeType);
  } catch (error) {
    console.error("PDF Export failed:", error);
    // Simple fallback alert for user
    alert("Ошибка при создании PDF файла. Попробуйте обновить страницу или экспортировать в Excel.");
  }
};

/**
 * Returns current date string in YYYY-MM-DD format
 * @returns {String}
 */
export const getDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
