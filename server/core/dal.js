var Groups = require('../core/groups.js');
var getLastQuarters = require('../core/data_normalizer.js').getLastQuarters;
var Filter = require('./filter.js');
var squel = require('squel');
var config = require('../config')
var db = require('./db.js');
var async = require('async');
var Promise = require('bluebird');
var es = require('./elasticClient.js')

var allowed_filters={
	'managing_body':simple_filter,
	'currency' : simple_filter,
	'rating':simple_filter,
	'report_year':simple_filter,
	'report_qurater':simple_filter,
	'instrument_id':simple_filter,
	'issuer':simple_filter,
	'instrument_name':simple_filter,
	'activity_industry':simple_filter,
	'reference_index':simple_filter,
	'fund_name' : simple_filter,
	'liquidity' : simple_filter,
	'asset_type' : simple_filter
};

/**
 * Escape single qoutes ' => ''
 * for SQL query
 * @param str: String to be escaped
 */
function escapeChars(str){
    return String(str).replace(/'/g, '\'\'');
}

/**
 * Appends WHERE clause to squel select object
 * for specific field and data
 *
 * @param select: squel query
 * @param constraintField: a field in filter, 'managing_body'
 * @param constraintDataArr: the filter of constraintField,
 *         [ { data: 'migdal' }, { data: 'harel' } ]
 *
 */
function simple_filter(select, constraintField, constraintDataArr)
{
	var expr=squel.expr();
	var values=[expr];

	// go over array of constratint data
	for (var i in constraintDataArr)
	{
		constraintData = constraintDataArr[i];

		if (constraintData['data'] == "null"){
			expr.or(constraintField + ' IS NULL');
		}
		else{
			expr.or(constraintField + '= ?');
		}


		//escape string
		var escapedConstraintData = escapeChars(constraintData['data']);
		values=values.concat(escapedConstraintData);
	}
	select.where.apply(null,values);
}

/**
 * Appends the WHERE clause to squel select object
 * according to the constraints in the filter
 * @param select: squel query
 * @param filter: filter object
 *
 */
function prepareWheres(select, filter)
{
	var constrainedFields = filter.getConstrainedFields();
	for (var index in constrainedFields)
	{
		var constraintField = constrainedFields[index];
		if (constraintField in allowed_filters)
		{
			var constraintDataArr = filter.getConstraint(constraintField);
			simple_filter(select, constraintField, constraintDataArr);
		}
		else if (constraintField == 'q'){
				var constraintDataArr = filter.getConstraint(constraintField);
				select.where("LOWER(instrument_name) like LOWER('%"+constraintDataArr[0]['data']+"%') OR LOWER(instrument_id) like LOWER('%"+constraintDataArr[0]['data']+"%')")

		}

	}
}

/**
 * Create multiple select queries by groups
 * one query for each group.
 * if filter contains "group_by" field, then group by groups in filter.
 * else group by every field which is in allowed_filters and not in filter.
 *
 * @param select: Squel select, is duplicated for each select group
 * @param filter: Filter object with constraints
 * @returns [Squel]: array of Squel select objects
 */
function prepareGroupBy(select, filter)
{
	var return_data=[];

	var all_groups;
	var groups_in_filter = filter.getConstraintData("group_by");

	if (groups_in_filter.length > 0){

		all_groups = groups_in_filter;
	}
	else{
		all_groups = Object.keys(allowed_filters);
	}


	for (var group_index in all_groups)
	{

		if (all_groups[group_index] in filter.constraints)
			continue;
		var new_select=select.clone(); //Deep copy

		new_select.group(all_groups[group_index]);
		new_select.field(all_groups[group_index]);


		return_data.push({"group_field":all_groups[group_index],"query":new_select})
	}
	return return_data;
}

/**
 * Convert Filter object to SQL Query
 * @param filter : Filter object
 * @return string : SQL query
 */
function parseFilter(filter)
{
	var select = squel.select().from(config.table);
	prepareWheres(select, filter);
	select=select.toString();
	return select;
}

/**
 * Perform query and resolve to result rows
 * @param filter: Filter object with constraints
 * @return Promise: resolves to result rows
 */
function singleQuery(filter)
{
	//add wheres to query
	var sqlQuery = parseFilter(filter);

	//perform query
	return db.queryp(sqlQuery);
}



/**
 * Perform stream query and resolve stream
 * to promise
 * @param filter: Filter object with constraints
 * @returns Promise that resolves to stream
 */
function streamQuery(filter)
{
	//add wheres to query
	var sqlQuery = parseFilter(filter);

	//perform query
	return db.streamQuery(sqlQuery);
}

/**
 * @param filter : Filter object
 * @return Promise : resolves to result rows
 */
function groupBySummaries(filter)
{
	var select = squel.select().from(config.table);

	//apply filter to select WHERE clause
	prepareWheres(select, filter);

	//create multiple queries for each group
	var groups = prepareGroupBy(select, filter);

	return Promise.map(groups, function(group){

		//add sum(fair_value) AS fair_value
		group.query.field('sum(fair_value)', 'fair_value' );

		//ORDER BY fair_value DESC
		group.query.order('sum(fair_value)',false);

		group.query=group.query.toString();

		//perform multiple queries

		return db.queryp(group.query)
			.then(function(rows){
				group.result = rows;
				return group;
			})
	});
}



/**
 * Query by filter constraint, group by last four quarters
 * resolves to result rows
 * @param filter : Filter object
 * @return Promise: resolves to result rows
 */
function groupByQuarters(filter){

	var mFilter = filter.clone();

	//report year and quarter
	var report_year = mFilter.getConstraintData("report_year")[0];
	var report_quarter = mFilter.getConstraintData("report_qurater")[0];

	mFilter.removeField("group_by");
	mFilter.removeField("report_year");
	mFilter.removeField("report_qurater");

	var select = squel.select().from(config.table);
	prepareWheres(select, mFilter);


	select.field("report_year");
	select.field("report_qurater");

	//group by year & quarter
	select.group("report_year");
	select.group("report_qurater");

	//sort by descending order
	select.order("report_year",false);
	select.order("report_qurater",false);

	//get last 4 quarters
	addLastQuartersToQuery(select, report_year, report_quarter, 4);


	//sum by fair_value
	select.field('sum(fair_value)', 'fair_value' );
	select.order('sum(fair_value)',false);

	select=select.toString();

	return db.queryp(select);

}

/**
 * Add previous quarters to Squel query
 * @param query    : Squel select
 * @param year     : starting year
 * @param quarter  : starting quarter
 * @param numOfQuarters : number of previous quarters to add to query
 */
function addLastQuartersToQuery(query, year, quarter, numOfQuarters){

	var expr=squel.expr();
	var quarters = 	getLastQuarters(year, quarter, numOfQuarters);
	for (var i = 0; i < quarters.length; i++){
		expr.or_begin()
	 		.and("report_year = "+ quarters[i]['year'])
	 		.and("report_qurater = " + quarters[i]['quarter'])
	 	.end();
	}

	query.where(expr);

	return query;
}


/**
 * Query DB, get info needed for portfolio view.
 * For each group in allowed_filters which is not in filter constraints,
 * get 5 top most rows, ordered by fair_value
 * joined with last four quarters.
 * Query structure generated is : outerSelect FROM ( innerSelect JOIN joined)

	query example:

     	SELECT * FROM
     	(
	     	SELECT ROW_NUMBER() OVER (ORDER BY sum(fair_value) DESC)
	     	AS rownumber, managing_body
	     	FROM pension_data_all
	     	WHERE (report_year= '2014') AND (report_qurater= '3')
	     	GROUP BY managing_body
     	) AS currentQuarter
     	INNER JOIN (
     		SELECT report_year, report_qurater, managing_body, sum(fair_value) AS "fair_value"
     		FROM pension_data_all
     		WHERE (
     			(report_year = 2014 AND report_qurater = 3) OR
     			(report_year = 2014 AND report_qurater = 2) OR
     			(report_year = 2014 AND report_qurater = 1) OR
     			(report_year = 2013 AND report_qurater = 4)
 			)
			GROUP BY report_year, report_qurater, managing_body) AS previousQuarters
		ON currentQuarter.managing_body= previousQuarters.managing_body
			OR (currentQuarter.managing_body IS NULL AND previousQuarters.managing_body IS NULL)
		WHERE (rownumber <= 5)
		ORDER BY report_year DESC, report_qurater DESC, fair_value DESC


 * @param filter : Filter object
 * @return  Promise: resolves to result rows
 */
function groupByPortfolio(filter){

	var mFilter = filter.clone();

	//report year and quarter
	var report_year = mFilter.getConstraintData("report_year")[0];
	var report_quarter = mFilter.getConstraintData("report_qurater")[0];

	var outerSelect;

	//inner select, with applied filter, for current quarter
	var innerSelect = squel.select().from(config.table);
	prepareWheres(innerSelect, mFilter);

	//add row_number to inner select, for getting top 5
	innerSelect.field("ROW_NUMBER() OVER (ORDER BY sum(fair_value) DESC) AS rownumber");

	var group_by_fields;

	var groupByData = mFilter.getConstraintData("group_by");
	mFilter.removeField("group_by");

	if (groupByData.length > 0){
		//got group by fields from user
		group_by_fields = groupByData;
	}
	else{
	    //add group by fields for display
		group_by_fields = Groups.getGroups(mFilter);
	}

    for( i in group_by_fields){
      mFilter.addConstraint("group_by",group_by_fields[i]);
    }

	//create multiple queries, one for each group
	var groups = prepareGroupBy(innerSelect, mFilter);


	return Promise.map(groups, function(group){

		var groupField = group['group_field'];
		group.query=group.query.toString();

		//joined select, for last four quarters
		var joined = squel.select().from(config.table);

		joined.field("report_year");
		joined.field("report_qurater");
		joined.field(groupField);
		joined.field('sum(fair_value)', 'fair_value' );

		mFilter.removeField("report_year");
		mFilter.removeField("report_qurater");

		//apply filter to joined WHERE clause
		prepareWheres(joined, mFilter);

		//add last quarters to joined
		addLastQuartersToQuery(joined, report_year, report_quarter, 4);

		joined.group("report_year");
		joined.group("report_qurater");
		joined.group(groupField);

		//outerSelect, wrapping inner and joined, get top 5 rows
		outerSelect = squel.select().from("("+group.query.toString()+") AS currentQuarter");
		outerSelect.where("rownumber <= 5");


		outerSelect.join("("+joined + ") AS previousQuarters ON currentQuarter." + groupField
			+"= previousQuarters."+groupField
			+ " OR (currentQuarter." + groupField + " IS NULL AND"
			+ " previousQuarters."+groupField + " IS NULL)");

		outerSelect.order("report_year",false);
		outerSelect.order("report_qurater",false);
		outerSelect.order("fair_value",false);


	 	group.query = outerSelect.toString();

	 	//run query for group in groups
		return db.queryp(group.query)
			.then(function(rows){
				group.result = rows;
				return group;
			});

	});
}


/**
 * Query DB, get info needed for investments view.
 * Creates an SQL query of the following template:
 *
 *   SELECT report_year, report_qurater, %GROUP_BY_FIELD%,
 *   sum(fair_value) AS fair_value
 *   FROM pension_data_all WHERE %FILTER_CONSTRAINTS%
 *   AND %LAST_4_QUARTERS%
 *   GROUP BY report_year, report_qurater, %GROUP_BY_FIELD%
 *   ORDER BY report_year DESC, report_qurater DESC, fair_value DESC
 *
 * @param filter : Filter object
 * @return Promise : resolves to result rows
 */
function groupByInvestments(filter){

	//remove group_by if present
	var mFilter = filter.clone();

	var report_year = mFilter.getConstraintData("report_year")[0];
	var report_quarter = mFilter.getConstraintData("report_qurater")[0];
	var groupBy = mFilter.getConstraintData("group_by")[0];


	var select = squel.select().from(config.table);

	select.field("report_year");
	select.field("report_qurater");
	select.field(groupBy +" AS name");
	select.field('sum(fair_value)', 'fair_value');


	//dont need year and quarter in where's, add last 4 q's later
	mFilter.removeField("report_year");
	mFilter.removeField("report_qurater");

	//apply filter constraints to WHERE clause
	prepareWheres(select, mFilter);

	//add last quarters to constraints
	addLastQuartersToQuery(select, report_year, report_quarter, 4);

	select.group("report_year");
	select.group("report_qurater");
	select.group(groupBy);

	select.order("report_year",false);
	select.order("report_qurater",false);
	select.order("fair_value",false);

	select = select.toString();

	return db.queryp(select);

}

/**
 * Query the DB, get list of managing bodies
 * @return Promise - resolves to managing bodies
 */
function getManagingBodies(){

	var select = squel.select().from(config.table);

	select.field("managing_body").distinct();

	var sqlQuery = select.toString();

	return db.queryp(sqlQuery);

}


/**
 * Query the DB, get funds by managing_body
 * @param managing_body : string, name of managing body
 * @return Promise : resolves to result rows.
 */
function getFundsByManagingBody(managing_body){
	if (managing_body == undefined || managing_body == ""){
			return new Promise.resolve("Error : Missing managing_body");
	}

	var select = squel.select().from(config.table);
	select.field("fund");
	select.field("fund_name");
	select.where("managing_body = '"+escapeChars(managing_body) +"'")
	select.group("fund_name");
	select.group("fund");
	select.order("fund",true);

	var sqlQuery = select.toString();

	return db.queryp(sqlQuery);

}

function searchInFields(term, limit){

	Promise.all([
		searchByField(term, "instrument_name", limit),
		searchByField(term, "instrument_id", limit),
		searchByField(term, "fund_name", limit),
		searchByField(term, "issuer", limit)
	])
	.then(function(results){


	      var s = {};

	      if (err){
	        console.log("Error:"+err);
	        res.end("Err: "+err);
	        return;
	      }

      	  s.assets = results[0].rows;
      	  s.instruments = results[1].rows;
      	  s.funds = results[2].rows;
      	  s.issuers = results[3].rows;

		  return s;

      });
}


function searchInFieldsEs(term, size){

	return Promise.all(
		[
			es.searchInIndex('instrument_name', term, size),
			es.searchInIndex('instrument_id', term, size),
			es.searchInIndex('fund_name', term, size)

		]
	)
	.then(function(results){

		var res = {};
			  res.assets = results[0]  ? results[0]: [];
			  res.instruments = results[1] ? results[1] : [];
			  res.funds = results[2] ? results[2] : [];
			  res.issuers = results[3] ? results[3]: [];

		return res;

	});

}


/**
 * Query the DB, find lines containing term in field
 * @param term : string, name/id to look for
 * @param field : string, field to look in
 * @return Promise: resolves to rows
 */
function searchByField(term, field, limit){
	var RESULTS_PER_PAGE = 50;


	if (term == undefined || term == "" ) {
		var res = [{"rows":[], "total_row_count" : 0, "page":0, "results_per_page" : RESULTS_PER_PAGE, "total_pages": 0}];
		return new Promise.resolve(res);
	}

	//query limited & offset
	var select = squel.select().from(config.table);
	select.distinct();
	select.field(field);
	select.where("LOWER("+field+") like LOWER('%"+escapeChars(term) +"%')");

	if (limit != undefined && limit != -1)
		select.limit(limit);


	db.queryp(select.toString())
		.then(function(rows){
		var res = {"rows":rows};
		return res;
	});

}



//exports
exports.groupBySummaries=groupBySummaries;
exports.parseFilter=parseFilter;
exports.allowed_filters=Object.keys(allowed_filters);
exports.singleQuery=singleQuery;
exports.groupByQuarters=groupByQuarters;
exports.groupByPortfolio=groupByPortfolio;
exports.getFundsByManagingBody=getFundsByManagingBody;
exports.groupByInvestments=groupByInvestments;
exports.getManagingBodies=getManagingBodies;
exports.streamQuery=streamQuery;
exports.searchInFields=searchInFields;
exports.searchInFieldsEs=searchInFieldsEs;
exports.searchByField=searchByField;
exports.addLastQuartersToQuery=addLastQuartersToQuery;
