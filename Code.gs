/**
 * Handles incoming GET requests to serve HTML pages or read data.
 */
function doGet(e) {
  let callback = null;

  try {
    const action = e && e.parameter && e.parameter.action;
    callback = e && e.parameter && e.parameter.callback;

    function respondMaybeJsonp(data) {
      if (callback) {
        return ContentService
          .createTextOutput(callback + '(' + JSON.stringify(data) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return respond(data);
    }

    // Default: serve main page
    if (!action) {
      return HtmlService.createTemplateFromFile('Index')
        .evaluate()
        .setTitle('Register | Digital ID')
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

    // API: logs
    if (action === 'logs') {
      const logs = getLogsFromClient();
      return respondMaybeJsonp({ success: true, logs });
    }

    // API: scan
    if (action === 'scan') {
      const result = handleScan({
        userId: e.parameter.userId,
        name:   e.parameter.name,
        role:   e.parameter.role,
        issued: e.parameter.issued
      });
      return respondMaybeJsonp(result);
    }

    // Admin endpoints
    if (action === 'adminStats' || action === 'adminLogs' || action === 'adminAttendance') {
      const token      = e.parameter.token;
      const validToken = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');

      if (!token || token !== validToken) {
        return respondMaybeJsonp({ error: "Unauthorized" });
      }

      if (action === 'adminStats')      return respondMaybeJsonp(getAdminStats());
      if (action === 'adminLogs')       return respondMaybeJsonp(getAdminLogs());
      if (action === 'adminAttendance') return respondMaybeJsonp(getAdminAttendance());
    }

    return respondMaybeJsonp({ success: false, message: "Unknown action" });

  } catch (err) {
    // 🔥 CRITICAL FIX: JSONP-safe error handling
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify({
          success: false,
          message: err.message
        }) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }

    return respond({ success: false, message: err.message });
  }
}

/**
 * Handles POST requests
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respond({ success: false, message: "Empty request body" });
    }

    const params = JSON.parse(e.postData.contents);
    const action = params.action;

    if (!action) {
      return respond({ success: false, message: "Missing action" });
    }

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
 * JSON response helper
 */
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Include HTML partials
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Get Web App URL
 */
function getAppUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * Admin stats
 */
function getAdminStats() {
  const usersData = getUsersSheet().getDataRange().getValues().slice(1);
  const logsData  = getLogsSheet().getDataRange().getValues().slice(1);
  const totalUsers = usersData.length;

  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  let scansToday = 0;

  logsData.forEach(row => {
    if (row[5]) {
      const scanDate = Utilities.formatDate(new Date(row[5]), Session.getScriptTimeZone(), "yyyy-MM-dd");
      if (scanDate === todayStr) scansToday++;
    }
  });

  let currentlyIn  = 0;
  let currentlyOut = 0;

  usersData.forEach(row => {
    const userId  = row[0];
    const lastLog = getLastLogForUser(userId);

    if (lastLog && lastLog.status === "IN")  currentlyIn++;
    if (lastLog && lastLog.status === "OUT") currentlyOut++;
  });

  return { totalUsers, scansToday, currentlyIn, currentlyOut };
}

/**
 * Admin logs
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
 * Admin attendance
 */
function getAdminAttendance() {
  const usersData = getUsersSheet().getDataRange().getValues().slice(1);

  return usersData.map(row => {
    const userId  = row[0];
    const lastLog = getLastLogForUser(userId);

    return {
      userId:     userId,
      name:       row[1],
      role:       row[3],
      department: row[4],
      status:     lastLog ? lastLog.status    : "NOT ARRIVED",
      lastSeen:   lastLog ? lastLog.scannedAt : "—"
    };
  });
}

// Client wrappers

function scanFromClient(params) {
  return handleScan(params);
}

function registerFromClient(params) {
  return registerUser(params);
}

function adminAuthFromClient(params) {
  const validPassword = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');

  if (params.password === validPassword) {
    return { authorized: true, token: validPassword };
  }

  return { authorized: false };
}

function getLogsFromClient() {
  const sheet = getLogsSheet();
  const data  = sheet.getDataRange().getValues();

  return data.slice(1).slice(-20).reverse().map(row => ({
    logId:     row[0],
    userId:    row[1],
    name:      row[2],
    role:      row[3],
    status:    row[4],
    scannedAt: row[5]
  }));
}