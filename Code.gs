/**
 * Handles incoming GET requests to serve HTML pages or read data.
 * @param {Object} e - Event object
 * @returns {HtmlOutput|TextOutput}
 */
function doGet(e) {
  try {
    if (!e || !e.parameter || !e.parameter.action) {
      return HtmlService.createTemplateFromFile('Index')
        .evaluate()
        .setTitle('Register | Digital ID')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    
    const action = e.parameter.action;
    
    if (action === 'scanner') {
      return HtmlService.createTemplateFromFile('Scanner')
        .evaluate()
        .setTitle('Scanner | Digital ID')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }

    if (action === 'admin') {
      return HtmlService.createTemplateFromFile('Admin')
        .evaluate()
        .setTitle('Admin | Digital ID')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
    }
    
    if (action === 'logs') {
      const sheet = getLogsSheet();
      const data = sheet.getDataRange().getValues();

      const logs = data
        .slice(1)
        .slice(-20)
        .reverse()
        .map(row => ({
          logId:     row[0],
          userId:    row[1],
          name:      row[2],
          role:      row[3],
          status:    row[4],
          scannedAt: row[5]
        }));

      return respond({ success: true, logs });
    }

    // Admin endpoints - require token validation
    if (action === 'adminStats' || action === 'adminLogs' || action === 'adminAttendance') {
      const token = e.parameter.token;
      const validToken = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
      if (!token || token !== validToken) {
        return respond({ error: "Unauthorized" });
      }

      if (action === 'adminStats') {
        return respond(getAdminStats());
      }
      if (action === 'adminLogs') {
        return respond(getAdminLogs());
      }
      if (action === 'adminAttendance') {
        return respond(getAdminAttendance());
      }
    }
    
    return respond({ success: false, message: "Unknown action" });

  } catch (err) {
    return respond({ success: false, message: err.message });
  }
}

/**
 * Handles incoming POST requests to write data.
 * @param {Object} e - Event object
 * @returns {TextOutput}
 */
function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;

    if (action === 'register') return respond(registerUser(params));
    if (action === 'saveQR')   return respond(saveQRToDrive(params));
    if (action === 'scan')     return respond(handleScan(params));
    
    if (action === 'adminAuth') {
      const validPassword = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
      if (params.password === validPassword) {
        return respond({ authorized: true, token: validPassword });
      }
      return respond({ authorized: false });
    }

    return respond({ success: false, message: "Unknown action" });
  } catch (err) {
    return respond({ success: false, message: err.message });
  }
}

/**
 * Helper to return JSON responses.
 * @param {Object} data - Payload to return
 * @returns {TextOutput}
 */
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Helper to include HTML files within templates.
 * @param {string} filename - Name of the file to include
 * @returns {string} - HTML content
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Fetches admin dashboard summary statistics.
 * @returns {Object} Stats payload
 */
function getAdminStats() {
  const usersData = getUsersSheet().getDataRange().getValues().slice(1);
  const logsData = getLogsSheet().getDataRange().getValues().slice(1);

  const totalUsers = usersData.length;
  
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  let scansToday = 0;
  logsData.forEach(row => {
    if (row[5]) {
      const scanDate = Utilities.formatDate(new Date(row[5]), Session.getScriptTimeZone(), "yyyy-MM-dd");
      if (scanDate === todayStr) scansToday++;
    }
  });

  let currentlyIn = 0;
  let currentlyOut = 0;
  
  usersData.forEach(row => {
    const userId = row[0];
    const lastLog = getLastLogForUser(userId);
    if (lastLog && lastLog.status === "IN") currentlyIn++;
    if (lastLog && lastLog.status === "OUT") currentlyOut++;
  });

  return { totalUsers, scansToday, currentlyIn, currentlyOut };
}

/**
 * Fetches the last 50 logs for the admin feed.
 * @returns {Array} Array of log objects
 */
function getAdminLogs() {
  const data = getLogsSheet().getDataRange().getValues().slice(1);
  return data.slice(-50).reverse().map(row => ({
    logId:     row[0],
    userId:    row[1],
    name:      row[2],
    role:      row[3],
    status:    row[4],
    scannedAt: row[5]
  }));
}

/**
 * Merges Users and Logs to provide a comprehensive attendance view.
 * @returns {Array} Array of user objects with current status
 */
function getAdminAttendance() {
  const usersData = getUsersSheet().getDataRange().getValues().slice(1);
  
  return usersData.map(row => {
    const userId = row[0];
    const lastLog = getLastLogForUser(userId);
    return {
      userId: userId,
      name: row[1],
      role: row[3],
      department: row[4],
      status: lastLog ? lastLog.status : "NOT ARRIVED",
      lastSeen: lastLog ? lastLog.scannedAt : "—"
    };
  });
}
