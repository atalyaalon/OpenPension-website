var DAL = require('../core/dal.js');
var Filter = require('../core/filter.js');
var _ = require('underscore');
var dictionary = require('../core/dictionary.js');
var DataNormalizer = require('../core/data_normalizer.js');
var config = require('../config');
var Promise = require('bluebird');

function groupByManagingBody(filter){

  var mFilter = new Filter();

  if (filter.hasConstraint("managing_body")
            &&  filter.getDrillDownDepth() > 1){
        mFilter.addConstraint("managing_body", filter.getConstraintData("managing_body"));
  }

  //add year and quarter to new fiter
  mFilter.addConstraint("report_year", filter.getConstraintData("report_year"));
  mFilter.addConstraint("report_qurater", filter.getConstraintData("report_qurater"));

  return mFilter;
}


exports.contentHeader = function(req,res){

    //create filter from request (search string)
    var filter = Filter.fromGetRequest(req);
    var managingBodyFilter = groupByManagingBody(filter);


	return Promise.all([
		DAL.groupByQuarters(managingBodyFilter),
		DAL.groupByQuarters(filter)
	])
	.then(function(results){


        var totalPensionFundQuarters = results[0];
        var quarters = results[1];

        var report_year = filter.getConstraintData("report_year")[0];
        var report_qurater = filter.getConstraintData("report_qurater")[0];
        var lastQuarters = DataNormalizer.getLastQuarters(report_year, report_qurater, 4);

        quarters = _.groupBy(quarters,
                  function(v2,k2,l2){
                    return v2['report_year']+"_"+v2['report_qurater'];
                  });

        totalPensionFundQuarters = _.groupBy(totalPensionFundQuarters,
                  function(v2,k2,l2){
                    return v2['report_year']+"_"+v2['report_qurater'];
                  });

        //fill up missing quarters with sum 0
        if (Object.keys(quarters).length < 4 ||
          Object.keys(totalPensionFundQuarters).length < 4){
          for(var q = 0; q < 4; q++){

            if (quarters[lastQuarters[q].str] == undefined){
              quarters[lastQuarters[q].str] = [{"fair_value":"0"}];
            }

            if (totalPensionFundQuarters[lastQuarters[q].str] == undefined){
              totalPensionFundQuarters[lastQuarters[q].str] = [{"fair_value":"0"}];
            }

          }
        }

        var result = {
          totalFilteredValues: [
                quarters[lastQuarters[0].str][0]['fair_value'],
                quarters[lastQuarters[1].str][0]['fair_value'],
                quarters[lastQuarters[2].str][0]['fair_value'],
                quarters[lastQuarters[3].str][0]['fair_value']
              ],
          totalPensionFundValues: [
                totalPensionFundQuarters[lastQuarters[0].str][0]['fair_value'],
                totalPensionFundQuarters[lastQuarters[1].str][0]['fair_value'],
                totalPensionFundQuarters[lastQuarters[2].str][0]['fair_value'],
                totalPensionFundQuarters[lastQuarters[3].str][0]['fair_value']
              ],
        }


        res.json(result);


      });




};

exports.quarters = function(req,res){

    //create filter from request (search string)
    var filter = Filter.fromGetRequest(req);

    DAL.groupByQuarters(filter)
	.then(function(quarters){

          var report_year = filter.getConstraintData("report_year")[0];
          var report_qurater = filter.getConstraintData("report_qurater")[0];

          var lastQuarters = DataNormalizer.getLastQuarters(report_year, report_qurater, 4);

          quarters = _.groupBy(quarters,
                    function(v2,k2,l2){
                      return v2['report_year']+"_"+v2['report_qurater'];
                    });


          //fill up missing quarters with sum 0
          if (Object.keys(quarters).length < 4 ){
            for(var q = 0; q < 4; q++){

              if (quarters[lastQuarters[q].str] == undefined){
                quarters[lastQuarters[q].str] = [{"fair_value":"0"}];
              }
            }
          }

        res.json(quarters);

      });


};

//Get list of Managing Bodies
exports.managing_bodies = function(req,res){
    DAL.getManagingBodies()
	.then(function(bodies){
          res.json(bodies);
    });
}

//Get Funds for managing Body - ?managing_body=xxxxx
exports.funds = function(req,res){

    //create filter from request (search string)
    var filter = Filter.fromGetRequest(req);

    var managing_body = filter.getConstraintData('managing_body')[0];

    return DAL.getFundsByManagingBody(managing_body)
	.then(function(funds){
        res.json(funds);
    });

};

exports.portfolio = function(req, res){


      //create filter from request (search string)
      var filter = Filter.fromGetRequest(req);

      DAL.groupByPortfolio(filter)
	  .then(function(groups){

        //group results by group_field (e.g. issuer)
        _.each(groups,
            function(value,key,list){
                var groupedResults = _.chain(value['result']).groupBy(value['group_field']).values().value();

                value['results'] = _.map(groupedResults, function(el,ind){

                  return {
                    name: el[0][this['group_field']],
                    fair_values : _.pluck(el, 'fair_value')
                  };
                }, value);

                delete value['query'];
                delete value['result'];
            }
        );

        res.json(groups);

      });

};


exports.investments = function(req, res){


      //create filter from request (search string)
      var filter = Filter.fromGetRequest(req);
      var groupBy = filter.getConstraintData('group_by')[0];
      var report_qurater = filter.getConstraintData('report_qurater')[0];
      var report_year = filter.getConstraintData('report_year')[0];
      var lastQuarters = DataNormalizer.getLastQuarters(report_year, report_qurater, 4);

      DAL.groupByInvestments(filter)
	  .then(function(group){

          var groupData = {};

          groupData['group_field'] = groupBy;

          var groupedResults = _.groupBy(group, 'name');
          groupData['results'] = _.map(groupedResults, function(el,ind){

            var fairValues = _.map(lastQuarters, function(quarter){

              var qData = _.where(el, {'report_qurater': quarter.quarter, 'report_year': quarter.year});

              if (qData == null || qData.length == 0) return 0;

              return qData[0].fair_value || 0;

            });

            return {
              name: el[0].name,
              fair_values : fairValues
            };

          });

        res.json(groupData);

      });

};


exports.fair_values = function(req,res){

    //create filter from request (search string)
    var filter = Filter.fromGetRequest(req);

    if ( filter.getConstrainedFields().length == 0 ){
      res.json({'error':'Query is empty','return_code':'-7'})
    }

	DAL.groupBySummaries(filter)
	.then(function(result){
			res.json(result);
    });

}



exports.queryNames = function(req, res, next){

    var term = req.query['q'];
    var field = req.query['f'];
	var size = req.query['s'];

    // var page = req.query['p'];

    if ( term == undefined ){
      res.json({'error':'Query is empty','return_code':'-7'})
    }

    exports.querySearchTerm(term, size)
    .then(function(result){
      res.json(result);
    })
    .catch(res.error);
}


var translatedManagingBodies=[];

DAL.getManagingBodies(function(err, rows){
  _.each(rows,function(row){
    translatedManagingBodies.push(
    {
      "translated_managing_body": dictionary.translate(row.managing_body),
      "managing_body":row.managing_body
    });
  })
});

function findInManagingBody(term){
  if (term == undefined || term == ''){
    return [];
  }

  return _.filter(translatedManagingBodies,
      function(managing_body){
        return managing_body.translated_managing_body.indexOf(term) > -1;
      });
}

exports.querySearchTerm = function(term, size){

      return DAL.searchInFieldsEs(term, size)
	  .then(function(result){

	        result['managingBodies'] = findInManagingBody(term);

    	    return result;
      });
}



//get current system configuration
exports.config = function(req,res){

  res.json(
    {
      current_year:config.current_year,
      current_quarter:config.current_quarter
    }
  );
}
