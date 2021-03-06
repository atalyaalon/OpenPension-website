define(function(require) {
  'use strict';
  var $ = require('jquery');
  var Highcharts = require('highcharts');

  // Static wrapper for sparkline plugin.
  var Sparkline = {
    draw: function () {
      var start = +new Date(),
          $tds = $("div[data-sparkline]"),
          fullLen = $tds.length,
          n = 0;

      // Creating sparkline charts is quite fast in modern browsers, but IE8 and mobile
      // can take some seconds, so we split the input into chunks and apply them in timeouts
      // in order avoid locking up the browser process and allow interaction.
      function doChunk(){
        var time = +new Date(),
            i,
            len = $tds.length;

        for (i = 0; i < len; i++) {
          var $td = $($tds[i]),
              stringdata = $td.data('sparkline'),
              arr = stringdata.split('; '),
              data = $.map(arr[0].split(', '), parseFloat),
              chart = {};

          if (arr[1]) {
            chart.type = arr[1];
          }

          var color;
          var dataDif = data[3] - data[0];

          if (dataDif < 0){
            color = '#FFBE4C'; //yellow
          }
          else if(dataDif == 0){
            color = '#999999'; //gray
          }
          else{
            color = '#7FB2FF'; //blue
          }

          $td.highcharts('SparkLine', {
            series: [{
              color: color,
              data: data,
              pointStart: 1
            }],
            tooltip: {
              //headerFormat: '<span style="font-size: 10px">' + $td.parent().find('th').html() + ', Q{point.x}:</span><br/>',
              headerFormat :'',
              pointFormat: '<b>% {point.y}</b>'
            },
            chart: chart
          });

          n++;

          // If the process takes too much time, run a timeout to allow interaction with the browser
          if (new Date() - time > 1500) {
            $tds.splice(0, i + 1);
            setTimeout(doChunk, 0);
            break;
          }
        }
      }
      doChunk();
    }
  };

  // Initialize sparkline jquery plugin.
  $(function () {
    /**
     * Create a constructor for sparklines that takes some sensible defaults
     * and merges in the individual chart options. This function is also
     * available from the jQuery plugin as $(element).highcharts('SparkLine').
     */
    Highcharts.SparkLine = function (options, callback) {
      var defaultOptions = {
        chart: {
          renderTo: (options.chart && options.chart.renderTo) || this,
          backgroundColor: null,
          borderWidth: 0,
          type: 'line',
          margin: [2, 0, 2, 0],
          width: 80,
          height: 20,
          style: {
            overflow: 'visible'
          },
          skipClone: true
        },
        title: {
          text: ''
        },
        credits: {
          enabled: false
        },
        xAxis: {
          labels: {
            enabled: false
          },
          title: {
            text: null
          },
          startOnTick: false,
          endOnTick: false,
          tickPositions: []
        },
        yAxis: {
          endOnTick: false,
          startOnTick: false,
          labels: {
            enabled: false
          },
          title: {
            text: null
          },
          tickPositions: [0]
        },
        legend: {
          enabled: false
        },
        tooltip: {
          backgroundColor: null,
          borderWidth: 0,
          shadow: false,
          useHTML: true,
          hideDelay: 0,
          shared: true,
          padding: 0,
          positioner: function (w, h, point) {
            return { x: point.plotX - w / 2, y: point.plotY - h};
          }
        },
        plotOptions: {
          series: {
            animation: false,
            lineWidth: 3, //width of graph
            shadow: false,
            states: {
              hover: {
                lineWidth: 3 //width of graph line
              }
            },
            marker: {
              radius: 1,
              states: {
                hover: {
                  radius: 2
                }
              }
            },
            fillOpacity: 0.25
          },
          column: {
            negativeColor: '#910000',
            borderColor: 'silver'
          }
        }
      };
      options = Highcharts.merge(defaultOptions, options);
      return new Highcharts.Chart(options, callback);
    };
  });

  return Sparkline;
});
