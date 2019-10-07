/**
 * ADT Pulse.
 *
 * A JavaScript library / Node module for ADT Pulse.
 *
 * @author Kevin Hickey <kevin@kevinmhickey.com>
 * @author Jacky Liang
 *
 * @since 1.0.0
 */
const cheerio     = require("cheerio");
const q           = require("q");
const request     = require("request");
const _           = require("lodash");
const hasInternet = require("internet-available");

/**
 * Browser configuration.
 *
 * The variable "jar" is for storing browser session cookies.
 *
 * @since 1.0.0
 */
let jar;
let userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.100 Safari/537.36";
let accept    = "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3";

/**
 * Track login, login statuses, portal versions.
 *
 * @since 1.0.0
 */
let authenticated    = false;
let isAuthenticating = false;
let lastKnownVersion = "";

/**
 * ADT Pulse constructor.
 *
 * @param {Object} options - Stores the configuration.
 *
 * @since 1.0.0
 */
pulse = function (options) {
    this.username = _.get(options, "username", "");
    this.password = _.get(options, "password", "");
    this.debug    = _.get(options, "debug", false);
};

/**
 * ADT Pulse login.
 *
 * @returns {Q.Promise<Object>}
 *
 * @since 1.0.0
 */
pulse.prototype.login = function () {
    let deferred = q.defer();
    let that     = this;

    hasInternet({
        timeout: 5000,
        retries: 3,
        domainName: "portal.adtpulse.com",
        port: 53,
    }).then(function () {
        if (authenticated) {
            deferred.resolve({
                "action": "LOGIN",
                "success": true,
                "info": {
                    "version": lastKnownVersion,
                },
            });
        } else {
            that.consoleLogger("ADT Pulse: Logging in...", "log");

            // Request a new cookie session.
            jar = request.jar();

            isAuthenticating = true;

            request(
                {
                    url: "https://portal.adtpulse.com",
                    jar: jar,
                    headers: {
                        "Accept": accept,
                        "User-Agent": userAgent,
                    },
                },
                function () {
                    request.post(
                        "https://portal.adtpulse.com/myhome/access/signin.jsp",
                        {
                            followAllRedirects: true,
                            jar: jar,
                            headers: {
                                "Host": "portal.adtpulse.com",
                                "User-Agent": userAgent,
                            },
                            form: {
                                username: that.username,
                                password: that.password,
                            },
                        },
                        function (error, response) {
                            isAuthenticating = false;

                            let regex        = new RegExp("^(\/myhome\/)(.*)(\/summary\/summary\.jsp)$");
                            let responsePath = _.get(response, "request.path");

                            that.consoleLogger(`ADT Pulse: Response path -> ${responsePath}`, "log");
                            that.consoleLogger(`ADT Pulse: Response path matches -> ${regex.test(responsePath)}`, "log");

                            if (error || !regex.test(responsePath)) {
                                authenticated = false;

                                that.consoleLogger("ADT Pulse: Login failed.", "error");

                                deferred.reject({
                                    "action": "LOGIN",
                                    "success": false,
                                    "info": null,
                                });
                            } else {
                                let version = response.request.path.match(regex)[2];

                                // Saves last known version for reuse later.
                                lastKnownVersion = version;

                                authenticated = true;

                                that.consoleLogger("ADT Pulse: Login success.", "log");
                                that.consoleLogger(`ADT Pulse: Web portal version -> ${version}`, "log");

                                deferred.resolve({
                                    "action": "LOGIN",
                                    "success": true,
                                    "info": {
                                        "version": version,
                                    },
                                });
                            }
                        }
                    );
                }
            );
        }
    }).catch(function () {
        that.consoleLogger("ADT Pulse: Internet connection is offline or \"https://portal.adtpulse.com\" is unavailable.", "error");

        deferred.reject({
            "action": "HOST_UNREACHABLE",
            "success": false,
            "info": null,
        });
    });

    return deferred.promise;
};

/**
 * ADT Pulse logout.
 *
 * @returns {Q.Promise<Object>}
 *
 * @since 1.0.0
 */
pulse.prototype.logout = function () {
    let deferred = q.defer();
    let that     = this;

    hasInternet({
        timeout: 5000,
        retries: 3,
        domainName: "portal.adtpulse.com",
        port: 53,
    }).then(function () {
        if (!authenticated) {
            deferred.resolve({
                "action": "LOGOUT",
                "success": true,
                "info": null,
            });
        } else {
            that.consoleLogger("ADT Pulse: Logging out...", "log");

            request(
                {
                    url: "https://portal.adtpulse.com/myhome/access/signout.jsp",
                    jar: jar,
                    headers: {
                        "User-Agent": userAgent,
                    }
                },
                function () {
                    authenticated = false;

                    that.consoleLogger("ADT Pulse: Logout success.", "log");

                    deferred.resolve({
                        "action": "LOGOUT",
                        "success": true,
                        "info": null,
                    });
                }
            );
        }
    }).catch(function () {
        that.consoleLogger("ADT Pulse: Internet connection is offline or \"https://portal.adtpulse.com\" is unavailable.", "error");

        deferred.reject({
            "action": "HOST_UNREACHABLE",
            "success": false,
            "info": null,
        });
    });

    return deferred.promise;
};

/**
 * ADT Pulse get device status.
 *
 * @returns {Q.Promise<Object>}
 *
 * @since 1.0.0
 */
pulse.prototype.getDeviceStatus = function () {
    let deferred = q.defer();
    let that     = this;

    hasInternet({
        timeout: 5000,
        retries: 3,
        domainName: "portal.adtpulse.com",
        port: 53,
    }).then(function () {
        that.consoleLogger("ADT Pulse: Getting device information...", "log");

        // Get security panel information, first.
        request(
            {
                url: "https://portal.adtpulse.com/myhome/system/device.jsp?id=1",
                jar: jar,
                headers: {
                    "User-Agent": userAgent,
                },
            },
            function (error, response, body) {
                let regex        = new RegExp("^(\/myhome\/)(.*)(\/system\/device\.jsp)(.*)$");
                let responsePath = _.get(response, "request.path");

                that.consoleLogger(`ADT Pulse: Response path -> ${responsePath}`, "log");
                that.consoleLogger(`ADT Pulse: Response path matches -> ${regex.test(responsePath)}`, "log");

                if (error || !regex.test(responsePath)) {
                    authenticated = false;

                    that.consoleLogger("ADT Pulse: Get device information failed.", "error");

                    deferred.reject({
                        "action": "GET_DEVICE_INFO",
                        "success": false,
                        "info": null,
                    });
                } else {
                    let $          = cheerio.load(body);
                    let deviceName = $("td.InputFieldDescriptionL:contains(\"Name\")").next().text().trim();
                    let deviceMake = $("td.InputFieldDescriptionL:contains(\"Manufacturer\")").next().text().trim();
                    let deviceType = $("td.InputFieldDescriptionL:contains(\"Type\")").next().text().trim();

                    that.consoleLogger("ADT Pulse: Getting device status...", "log");

                    // Then, get security panel status.
                    request(
                        {
                            url: "https://portal.adtpulse.com/myhome/ajax/orb.jsp",
                            jar: jar,
                            headers: {
                                "User-Agent": userAgent,
                            },
                        },
                        function (error, response, body) {
                            let regex        = new RegExp("^(\/myhome\/)(.*)(\/ajax\/orb\.jsp)$");
                            let responsePath = _.get(response, "request.path");

                            that.consoleLogger(`ADT Pulse: Response path -> ${responsePath}`, "log");
                            that.consoleLogger(`ADT Pulse: Response path matches -> ${regex.test(responsePath)}`, "log");

                            if (error || !regex.test(responsePath)) {
                                that.consoleLogger("ADT Pulse: Get device status failed.", "error");

                                deferred.reject({
                                    "action": "GET_DEVICE_STATUS",
                                    "success": false,
                                    "info": null,
                                });
                            } else {
                                let $           = cheerio.load(body);
                                let textSummary = $("#divOrbTextSummary span").text();
                                let theState    = textSummary.substr(0, textSummary.indexOf("."));
                                let theStatus   = textSummary.substr(textSummary.indexOf(".") + 2).slice(0, -1);

                                /**
                                 * These are the possible states and statuses.
                                 *
                                 * State:
                                 *   "Disarmed"
                                 *   "Armed Away"
                                 *   "Armed Stay"
                                 *   "Status Unavailable"
                                 * Status:
                                 *   "All Quiet"
                                 *   "1 Sensor Open" or "x Sensors Open"
                                 *   "Sensor Bypassed" or "Sensors Bypassed"
                                 *   "Sensor Tripped" or "Sensors Tripped"
                                 *   "Motion"
                                 *   "Uncleared Alarm"
                                 *   "Carbon Monoxide Alarm"
                                 *   "FIRE ALARM"
                                 *   "BURGLARY ALARM"
                                 *   "Sensor Problem"
                                 *   ""
                                 */
                                deferred.resolve({
                                    "action": [
                                        "GET_DEVICE_INFO",
                                        "GET_DEVICE_STATUS",
                                    ],
                                    "success": true,
                                    "info": {
                                        "name": deviceName,
                                        "make": deviceMake,
                                        "type": deviceType,
                                        "state": theState,
                                        "status": theStatus,
                                    },
                                });
                            }
                        }
                    );
                }
            }
        );
    }).catch(function () {
        that.consoleLogger("ADT Pulse: Internet connection is offline or \"https://portal.adtpulse.com\" is unavailable.", "error");

        deferred.reject({
            "action": "HOST_UNREACHABLE",
            "success": false,
            "info": null,
        });
    });

    return deferred.promise;
};

/**
 * ADT Pulse set device status.
 *
 * @param {string} armState - Can be "disarmed", "disarmed+with+alarm", "away", "stay".
 * @param {string} arm      - Can be "off", "away", "stay".
 *
 * @returns {Q.Promise<Object>}
 *
 * @since 1.0.0
 */
pulse.prototype.setDeviceStatus = function (armState, arm) {
    let deferred = q.defer();
    let that     = this;

    hasInternet({
        timeout: 5000,
        retries: 3,
        domainName: "portal.adtpulse.com",
        port: 53,
    }).then(function () {
        /**
         * Pulse URLs to set device status.
         *
         * Notes:
         * - When disarming, the armState will be set to "disarmed" (normally it is "off") until next login.
         * - Arming with armState "off" (while armState is "disarmed") works.
         *
         * Disarmed:
         * - Arm Away (https://portal.adtpulse.com/myhome/quickcontrol/armDisarm.jsp?href=rest/adt/ui/client/security/setArmState&armstate=disarmed&arm=away)
         * - Arm Stay (https://portal.adtpulse.com/myhome/quickcontrol/armDisarm.jsp?href=rest/adt/ui/client/security/setArmState&armstate=disarmed&arm=stay)
         * - Disarm (https://portal.adtpulse.com/myhome/quickcontrol/armDisarm.jsp?href=rest/adt/ui/client/security/setArmState&armstate=disarmed&arm=off)
         * - Clear Alarm (https://portal.adtpulse.com/myhome/quickcontrol/armDisarm.jsp?href=rest/adt/ui/client/security/setArmState&armstate=disarmed+with+alarm&arm=off)
         * Armed Away:
         * - Disarm (https://portal.adtpulse.com/myhome/quickcontrol/armDisarm.jsp?href=rest/adt/ui/client/security/setArmState&armstate=away&arm=off)
         * - Clear Alarm (https://portal.adtpulse.com/myhome/quickcontrol/armDisarm.jsp?href=rest/adt/ui/client/security/setArmState&armstate=disarmed+with+alarm&arm=off)
         * Armed Stay:
         * - Disarm (https://portal.adtpulse.com/myhome/quickcontrol/armDisarm.jsp?href=rest/adt/ui/client/security/setArmState&armstate=stay&arm=off)
         * - Clear Alarm (https://portal.adtpulse.com/myhome/quickcontrol/armDisarm.jsp?href=rest/adt/ui/client/security/setArmState&armstate=disarmed+with+alarm&arm=off)
         *
         * @type {string}
         */
        let url = "https://portal.adtpulse.com/myhome/quickcontrol/armDisarm.jsp?href=rest/adt/ui/client/security/setArmState&armstate=" + armState + "&arm=" + arm;

        that.consoleLogger("ADT Pulse: Setting device status...", "log");

        request(
            {
                url: url,
                jar: jar,
                headers: {
                    "User-Agent": userAgent,
                    "Referer": "https://portal.adtpulse.com/myhome/summary/summary.jsp",
                },
            },
            function (error, response, body) {
                let regex        = new RegExp("^(\/myhome\/)(.*)(\/quickcontrol\/armDisarm\.jsp)(.*)$");
                let responsePath = _.get(response, "request.path");

                that.consoleLogger(`ADT Pulse: Response path -> ${responsePath}`, "log");
                that.consoleLogger(`ADT Pulse: Response path matches -> ${regex.test(responsePath)}`, "log");

                if (error || !regex.test(response.request.path)) {
                    authenticated = false;

                    that.consoleLogger(`ADT Pulse: Set device status to ${arm} failed.`, "error");

                    deferred.reject({
                        "action": "SET_DEVICE_STATUS",
                        "success": false,
                        "info": null,
                    });
                } else {
                    let $       = cheerio.load(body);
                    let onClick = $("#arm_button_1").attr("onclick");
                    let satCode = (onClick !== undefined) ? onClick.split("sat=")[1].split("&")[0] : undefined;

                    // Check if system requires force arming.
                    if (arm === "away" && onClick !== undefined && satCode !== undefined) {
                        let forceUrlBase = "https://portal.adtpulse.com/myhome/quickcontrol/serv/RunRRACommand";
                        let forceUrlArgs = `?sat=${satCode}&href=rest/adt/ui/client/security/setForceArm&armstate=forcearm&arm=away`;
                        let forceUrl     = forceUrlBase + forceUrlArgs;

                        that.consoleLogger("ADT Pulse: Some sensors are open or reporting motion. Forcing Arm Away...", "warn");

                        request(
                            {
                                url: forceUrl,
                                jar: jar,
                                headers: {
                                    "User-Agent": userAgent,
                                    "Referer": "https://portal.adtpulse.com/myhome/quickcontrol/armDisarm.jsp"
                                },
                            },
                            function (error, response) {
                                let regex        = new RegExp("^(\/myhome\/)(.*)(\/quickcontrol\/serv\/RunRRACommand)(.*)$");
                                let responsePath = _.get(response, "request.path");

                                that.consoleLogger(`ADT Pulse: Response path -> ${responsePath}`, "log");
                                that.consoleLogger(`ADT Pulse: Response path matches -> ${regex.test(responsePath)}`, "log");

                                if (error || !regex.test(response.request.path)) {
                                    authenticated = false;

                                    that.consoleLogger(`ADT Pulse: Set device status to ${arm} failed.`, "error");

                                    deferred.reject({
                                        "action": "SET_DEVICE_STATUS",
                                        "success": false,
                                        "info": null,
                                    });
                                } else {
                                    that.consoleLogger(`ADT Pulse: Set device status to ${arm} success.`, "log");

                                    deferred.resolve({
                                        "action": "SET_DEVICE_STATUS",
                                        "success": true,
                                        "info": null,
                                    });
                                }
                            }
                        );
                    } else {
                        that.consoleLogger(`ADT Pulse: Set device status to ${arm} success.`, "log");

                        deferred.resolve({
                            "action": "SET_DEVICE_STATUS",
                            "success": true,
                            "info": null,
                        });
                    }
                }
            }
        );
    }).catch(function () {
        that.consoleLogger("ADT Pulse: Internet connection is offline or \"https://portal.adtpulse.com\" is unavailable.", "error");

        deferred.reject({
            "action": "HOST_UNREACHABLE",
            "success": false,
            "info": null,
        });
    });

    return deferred.promise;
};

/**
 * ADT Pulse get zone status.
 *
 * @returns {Q.Promise<Object>}
 *
 * @since 1.0.0
 */
pulse.prototype.getZoneStatus = function () {
    let deferred = q.defer();
    let that     = this;

    hasInternet({
        timeout: 5000,
        retries: 3,
        domainName: "portal.adtpulse.com",
        port: 53,
    }).then(function () {
        that.consoleLogger("ADT Pulse: Getting zone status...", "log");

        request(
            {
                url: "https://portal.adtpulse.com/myhome/ajax/homeViewDevAjax.jsp",
                jar: jar,
                headers: {
                    "User-Agent": userAgent,
                },
            },
            function (error, response, body) {
                let regex        = new RegExp("^(\/myhome\/)(.*)(\/ajax\/homeViewDevAjax\.jsp)$");
                let responsePath = _.get(response, "request.path");

                that.consoleLogger(`ADT Pulse: Response path -> ${responsePath}`, "log");
                that.consoleLogger(`ADT Pulse: Response path matches -> ${regex.test(responsePath)}`, "log");

                // If error, wrong path, or HTML format.
                if (error || !regex.test(response.request.path) || body.indexOf("<html") > -1) {
                    authenticated = false;

                    that.consoleLogger("ADT Pulse: Get zone status failed.", "error");

                    deferred.reject({
                        "action": "GET_ZONE_STATUS",
                        "success": false,
                        "info": null,
                    });
                } else {
                    let allDevices = JSON.parse(body)["items"];
                    let sensors    = _.filter(allDevices, function (device) {
                        return device["id"].indexOf("sensor-") > -1;
                    });

                    // Only sensors are supported.
                    let output = _.map(sensors, function (device) {
                        let id    = device["id"];
                        let name  = device["name"];
                        let tags  = device["tags"];
                        let state = device["state"]["icon"];

                        /**
                         * Examples of output.
                         *
                         * id:    sensor-[integer]
                         * name:  device name
                         * tags:  sensor,[doorWindow,motion,glass,co,fire]
                         * state: devStatOK (device okay)
                         *        devStatOpen (door/window opened)
                         *        devStatMotion (detected motion)
                         *        devStatTamper (glass broken or device tamper)
                         *        devStatAlarm (detected CO/Smoke)
                         */
                        return {
                            'id': id,
                            'name': name,
                            'tags': tags,
                            'state': state,
                        };
                    });

                    deferred.resolve({
                        "action": "GET_ZONE_STATUS",
                        "success": true,
                        "info": output,
                    });
                }
            }
        );
    }).catch(function () {
        that.consoleLogger("ADT Pulse: Internet connection is offline or \"https://portal.adtpulse.com\" is unavailable.", "error");

        deferred.reject({
            "action": "HOST_UNREACHABLE",
            "success": false,
            "info": null,
        });
    });

    return deferred.promise;
};

/**
 * ADT Pulse sync protocol.
 *
 * @returns {Q.Promise<Object>}
 *
 * @since 1.0.0
 */
pulse.prototype.performPortalSync = function () {
    let deferred = q.defer();
    let that     = this;

    hasInternet({
        timeout: 5000,
        retries: 3,
        domainName: "portal.adtpulse.com",
        port: 53,
    }).then(function () {
        that.consoleLogger("ADT Pulse: Performing portal sync...", "log");

        request(
            {
                url: "https://portal.adtpulse.com/myhome/Ajax/SyncCheckServ" + "?t=" + Date.now(),
                jar: jar,
                headers: {
                    "User-Agent": userAgent,
                    "Referer": "https://portal.adtpulse.com/myhome/summary/summary.jsp",
                },
            },
            function (error, response, body) {
                let regex        = new RegExp("^(\/myhome\/)(.*)(\/Ajax\/SyncCheckServ)(.*)$");
                let responsePath = _.get(response, "request.path");

                that.consoleLogger(`ADT Pulse: Response path -> ${responsePath}`, "log");
                that.consoleLogger(`ADT Pulse: Response path matches -> ${regex.test(responsePath)}`, "log");

                // If error, wrong path, or HTML format.
                if (error || !regex.test(responsePath) || body.indexOf("<html") > -1) {
                    authenticated = false;

                    that.consoleLogger("ADT Pulse: Failed to sync with portal.", "error");

                    deferred.reject({
                        "action": "SYNC",
                        "success": false,
                        "info": null,
                    });
                } else {
                    /**
                     * May return status codes like this:
                     *   1-0-0
                     *   2-0-0
                     *   [integer]-0-0
                     *   [integer]-[integer]-0
                     */
                    deferred.resolve({
                        "action": "SYNC",
                        "success": true,
                        "info": {
                            "syncCode": body,
                        },
                    });
                }
            }
        );
    }).catch(function () {
        that.consoleLogger("ADT Pulse: Internet connection is offline or \"https://portal.adtpulse.com\" is unavailable.", "error");

        deferred.reject({
            "action": "HOST_UNREACHABLE",
            "success": false,
            "info": null,
        });
    });

    return deferred.promise;
};

/**
 * ADT Pulse console logger.
 *
 * @param {string} content - The message or content being recorded into the logs.
 * @param {string} type   - Can be "error", "warn", or "log".
 */
pulse.prototype.consoleLogger = function (content, type) {
    if (this.debug) {
        switch (type) {
            case "error":
                console.error(content);
                break;
            case "warn":
                console.warn(content);
                break;
            case "log":
                console.log(content);
                break;
        }
    }
};

module.exports = pulse;
