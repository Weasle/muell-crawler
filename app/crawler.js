var request = require('request');
var Q = require('q');
var cheerio = require('cheerio');
var fs = require('fs');
var ical = require('ical-generator');
var foreach = require('lodash.foreach');

var year = 2018;
var url = 'https://www.norderstedt.de/output/abfall_export.php?call=suche&print=1&ort=1087.1&strasse=1917.59.1&abfart%5B0%5D=1917.4&abfart%5B1%5D=1.4&abfart%5B2%5D=1.2&abfart%5B3%5D=1917.1&abfart%5B4%5D=1917.2&abfart%5B5%5D=1917.3&vtyp=1&vMo=01&vJ='+year+'&bMo=12';
var icalFile = './export/calendar.ics';
var categories = {
    '1917.4': 'Restmüll (4-wöchentlich)',
    '1.4': 'Biotonne',
    '1.2': 'Grüner Punkt',
    '1917.1': 'Papiertonne',
    '1917.2': 'Strauchwerk',
    '1917.3': 'Weihnachtsbaum'
};

function getMuellData() {
    var deferred = Q.defer();
    var cacheFile = '/tmp/muellCrawler.html';
    var enc = 'utf8';
    if (fs.readFile(cacheFile, enc, (fileReadError, data) => {
        if (fileReadError) {
            console.log('Reading from source');
            request.get(url, function (error, response, body) {
                 if (error) {
                        deferred.reject(error);
                    } else if (response.statusCode != 200) {
                        deferred.reject('HTTP Error ' + response.statusCode + ': ' + body);
                    } else {
                        fs.writeFile(cacheFile, body, 'utf8', (fileWriteError) => {
                            if (fileWriteError) {
                                throw fileWriteError;
                            }
                            console.log('It\'s saved!');
                        });
                        deferred.resolve(body);
                    }
                }
            );
        } else {
            console.log('Reading from cache');
            deferred.resolve(data);
        }
    }));

    return deferred.promise;
}

var parseData = function (data) {
    var $ = cheerio.load(data);
    var tables = $('table.abf_art.abf1');
    var dates = {};
    tables.each(function (index) {
        var catTd = $(this).find('td.abf_art.abf2');
        var table = catTd.closest('table');
        var categoryId = catTd.removeClass('abf_art abf2').attr('class').replace('abf_artid_', '').replace('_', '.');
        var categoryLabel = categories[categoryId];
        catTd.parent().remove();
        var catDatesStrings = table.find('.text2').text().match(/\d+\.\d+\.\d+/g);
        var catDates = [];
        foreach(catDatesStrings, function (dateString) {
            var split = dateString.split('.');
            var date = new Date('20' + split[2], parseInt(split[1])-1, parseInt(split[0]), 8, 0, 0);
            catDates.push(date);
        });
        dates[categoryId] = {
            'label': categoryLabel,
            'dates': catDates
        };
    });
    return dates;
};

var getEvents = function (calendarDates) {
    var events = [];
    foreach(calendarDates, function (catDates, id) {
        foreach(catDates.dates, function (date) {
            // console.log(alarmDate.toDate());
            var alarms = [
                {type: 'audio', trigger: (60*60*11)}
            ];
            // Strauchwerk needs more alarms
            if (id === '1917.2') {
                alarms.push({type: 'display', trigger: (60*60*24*14)});
                alarms.push({type: 'display', trigger: (60*60*24*7)});
            }
            events.push({
                start: date,
                end: new Date(date.getTime() + 3600000),
                summary: catDates.label,
                alarms: alarms
            });
        });
    });

    return events;
};

// var data = fs.readFileSync('/tmp/muellCrawler.html', 'utf8');
// console.log(parseData(data));

getMuellData().then(
    function (data) {
        var calendarDates = parseData(data);
        var events = getEvents(calendarDates);
        var calendar = ical({
            domain: 'sonnenburg.name',
            name: 'Müllabfuhr Kalender',
            timezone: 'Europe/Berlin',
            prodId: '//sonnenburg.name//muell-kalender//DE',
            events: events
        });
        calendar.save(icalFile, function (error) {
            if (error) {
                console.log(error);
            } else {
                console.log('Saved to ' + icalFile);
            }
        });
    },
    function (error) {
        console.log(error);
    }
);
