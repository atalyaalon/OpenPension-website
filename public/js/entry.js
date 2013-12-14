$(function(){
	

    $('#select_group_by').selectpicker();

    $('#select_group_by').on('change', function() {
        setConstraint("group_by",this.value);

    });
		
		
		var moshe = 'רבעון ' + Number($('#graphdata0-report_qurater').text()) + ' ' + Number($('#graphdata0-report_year').text());
		
		var lastYearChanges = ((Number($('#graphdata3-sum_market_cap').text()) - Number($('#graphdata0-sum_market_cap').text()))*Number($('#graphdata3-sum_market_cap').text())/100).toFixed(2); 
		var lastQuarterChanges = ((Number($('#graphdata3-sum_market_cap').text()) - Number($('#graphdata2-sum_market_cap').text()))*Number($('#graphdata3-sum_market_cap').text())/100).toFixed(2); 

		var lastYearChangesText = (lastYearChanges > 0)? "עליה של " + lastYearChanges :"ירידה של " + lastYearChanges*(-1)
		var lastQuarterChangesText = (lastQuarterChanges > 0)? "עליה של " + lastQuarterChanges :"ירידה של " + lastQuarterChanges*(-1)
		var colorTitle = (lastYearChanges < 0)? "#f00" : "#090" ; 
		
		lastYearChangesText += "%" + " בשנה האחרונה"
		lastQuarterChangesText += "%" + " ברבעון האחרון"
		
		minVal = Math.min(Number($('#graphdata0-sum_market_cap').text()), Number($('#graphdata1-sum_market_cap').text()), Number($('#graphdata2-sum_market_cap').text()), Number($('#graphdata3-sum_market_cap').text()))
		maxVal = Math.max(Number($('#graphdata0-sum_market_cap').text()), Number($('#graphdata1-sum_market_cap').text()), Number($('#graphdata2-sum_market_cap').text()), Number($('#graphdata3-sum_market_cap').text()))




		
        $('#imagraph').highcharts({
            chart: {
				//backgroundColor: '#F4F4F4'
                //type: 'column'
            },
            title: {
                text: ''
            },
            subtitle: {
				//align: 'right',
				style: {
					//fontFamily: 'monospace',
					color: colorTitle, 
					margin: "5px" 
				},
				x:  150,
				rtl: true,
                text: lastYearChangesText
				
            },
            xAxis: {
			   lineWidth: 0,
			   minorGridLineWidth: 0,
			   lineColor: 'transparent',
			   minorTickLength: 0,
			   tickLength: 0,
                categories: ['רבעון ' + Number($('#graphdata0-report_qurater').text()) + ' ' + Number($('#graphdata0-report_year').text()),
				             'רבעון ' + Number($('#graphdata1-report_qurater').text()) + ' ' + Number($('#graphdata1-report_year').text()),
							 'רבעון ' + Number($('#graphdata2-report_qurater').text()) + ' ' + Number($('#graphdata2-report_year').text()),
							 'רבעון ' + Number($('#graphdata3-report_qurater').text()) + ' ' + Number($('#graphdata3-report_year').text())],
                title: {
                    text: null
                }
            },
			legend: {
				enabled: false
			},
            yAxis: {
				minPadding: 1,
				gridLineColor: 'transparent',
                min: minVal,
				max: maxVal + 0.2,
                title: {
					//rtl: true,
                    text: '',
                    align: 'high'
                },
                labels: {
                    overflow: 'justify',
					enabled: false 
                }
            },
            tooltip: {
                enabled: false
            },
            credits: {
                enabled: false
            },
			plotOptions: {
				series: {
					marker: {
						fillColor: '#FFFFFF',
						lineWidth: 2,
						lineColor: null // inherit from series
					}
				}
			},
            series: [{
                //name: 'Year 1800',
                data: [Number(Number($('#graphdata0-sum_market_cap').text()).toFixed(1)), Number(Number($('#graphdata1-sum_market_cap').text()).toFixed(1)), 
				       Number(Number($('#graphdata0-sum_market_cap').text()).toFixed(1)), Number(Number($('#graphdata0-sum_market_cap').text()).toFixed(1))],
                pointWidth: 80,
                dataLabels: {
                    enabled: true,
                    //rotation: -90,
                    color: '090',
                    align: 'center',
                    x: 15,
                    y: -30,
                        style: {
                            fontSize: '13px',
                            fontFamily: 'Verdana, sans-serif'
                        }     
                }
            }]
        });
    

	
	
	// PIE Chart
	
    $('#pieChart').highcharts({
        chart: {
            //backgroundColor: '#F4F4F4',
            plotBorderWidth: null,
            plotShadow: false
        },
        title: {
            text: ''
        },
        tooltip: {
            enabled: false, 
    	    pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>'
        },
        plotOptions: {
            pie: {
                allowPointSelect: true,
                cursor: 'pointer',
                dataLabels: {
                    enabled: false,
                    color: '#000000',
                    connectorColor: '#000000',
                    format: '<b>{point.name}</b>: {point.percentage:.1f} %'
                }
            }
        },
		credits: {
            enabled: false
        },
        series: [{
            type: 'pie',
            name: '',
            data: [
                //['Firefox',   45.0],
                //['IE',       26.8],
				['Others',   75],
                {
                    name: 'Chrome',
                    y: 12.8,
                    sliced: true,
                    selected: true
                }
                //['Safari',    8.5],
                //['Opera',     6.2],
            ]
        }]
    });
	
	
	
	
	
	
	
	
	
	
	
	
});


//add new constraint to filter and reload page
function addConstraint(key,value){

  //TODO: remove this and implement
  //instrument_details 
  if($('#select_group_by option').length <= 1){
     alert("אין יותר חלוקות");
     return;
  }
  //generate filter from query string
  var filter = Filter.fromQueryString(window.location.search);

  //add constraint from user
  filter.addConstraint(key,value);

  var instrument_sub_type = filter.getConstraintData("instrument_sub_type")[0];
 
  //get next grouping category
  var group_by = Categories.getNextGroupingCategory(filter);

  if (group_by !== undefined){
    filter.setConstraint("group_by",group_by);
  }
  else{ //no group found for grouping
    filter.removeField("group_by");
  }

  //convert filter back to query string, and apply location
  window.location.href = filter.toQueryString();
}


function setConstraint(key,value){
  //generate filter from query string
  var filter = Filter.fromQueryString(window.location.search);

  //add constraint from user
  filter.setConstraint(key,value);

  //convert filter back to query string, and apply location
  window.location.href = filter.toQueryString();

}
