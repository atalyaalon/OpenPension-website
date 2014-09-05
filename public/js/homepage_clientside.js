  var margin = {top: 0, right: -3, bottom: 0, left: 0},
      width = 946, 
      height = 470;



  	$(function(){
		  drawGraph("managing-bodies","/managing_bodies_treemap.json");
		  drawGraph("issuers","/issuers_treemap.json");
  	});

  function drawGraph(elementId, jsonURL){

	  var color = d3.scale.category20c();

	  var treemap = d3.layout.treemap()
	      .size([width, height])
	      .sticky(true)
	      .value(function(d) { return d.size; });


	  var div = d3.select("#"+elementId).append("div")
	      .style("position", "relative")
	      .style("width", (width + margin.left + margin.right) + "px")
	      .style("height", (height + margin.top + margin.bottom) + "px")
	      .style("left", margin.left + "px")
	      .style("top", margin.top + "px");

	  d3.json(jsonURL, function(error, root) {
      	
      	var node = div.datum(root).selectAll(".node")
          .data(treemap.nodes)
          .enter().append("div")
          .attr("class", "node")
          .attr("onclick",function(d){return "window.location = '"+d.link+"'"})
          .call(position)
          .style("background", "#3B70BF" )
          .style("cursor", "pointer")
          .html(function(d) { return "<span class='title'>"+d.translatedName+"</span><br/>"+d.sizeDescription; });

		d3.selectAll("input").on("change", function change() {
			var value = this.value === "count"
				? function() { return 1; }
				: function(d) { return d.size; };

        node
          .data(treemap.value(value).nodes)
          .transition()
          .duration(1500)
          .call(position);
        });

      //remove text content of small graph blocks where text cannot fit
      $("#"+ elementId +" div").each(function(i,e){ if($(e).width() < 150 ) $(e).html("") })

	  });

  
   }


  function position() {
    this.style("left", function(d) { return d.x + "px"; })
        .style("top", function(d) { return d.y + "px"; })
        .style("width", function(d) { return Math.max(0, d.dx - 1) + "px"; })
        .style("height", function(d) { return Math.max(0, d.dy - 1) + "px"; });
  }
