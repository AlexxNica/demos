var app = angular.module('routing', []);
var hash_params = L.Hash.parseHash(location.hash);
var mode_mapping = {
  'foot' : 'pedestrian',
  'car' : 'auto',
  'bicycle' : 'bicycle',
  'transit' : 'multimodal'
};
var date = new Date();
var isoDateTime = date.toISOString(); // "2015-06-12T15:28:46.493Z"
var serviceUrl;
var envToken;
var elevToken;
var envServer;
var elevServiceUrl;

function selectEnv() {
  $("option:selected").each(function() {
    envServer = $(this).text();
    serviceUrl = document.getElementById(envServer).value;
    getEnvToken();
  });
}

function getEnvToken() {
  switch (envServer) {
  case "localhost":
    envToken = accessToken.local;
    elevServiceUrl = elevationServer.local;
    elevToken = elevAccessToken.local;
    break;
  case "development":
    envToken = accessToken.dev;
    elevServiceUrl = elevationServer.dev;
    elevToken = elevAccessToken.dev;
    break;
  case "production":
    envToken = accessToken.prod;
    elevServiceUrl = elevationServer.prod;
    elevToken = elevAccessToken.prod;
    break;
  }
}

// sets ISO date time to 12:15 of current date on initial transit run
function parseIsoDateTime(dtStr) {
  var dt = dtStr.split("T");
  return dtStr.replace(dt[1], "12:15:00");
}
var dateStr = parseIsoDateTime(isoDateTime.toString());

app.run(function($rootScope) {
  var hash_loc = hash_params ? hash_params : {
    'center' : {
      'lat' : 40.7486,
      'lng' : -73.9690
    },
    'zoom' : 13
  };
  $rootScope.geobase = {
    'zoom' : hash_loc.zoom,
    'lat' : hash_loc.center.lat,
    'lon' : hash_loc.center.lng
  }
  $(document).on('new-location', function(e) {
    $rootScope.geobase = {
      'zoom' : e.zoom,
      'lat' : e.lat,
      'lon' : e.lon
    };
  })
});

app.controller('RouteController', function($scope, $rootScope, $sce, $http) {
  /*var roadmap = L.tileLayer('http://otile3.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png', {
    attribution : 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>'
  }),*/ 
  var roadmap = L.tileLayer('http://b.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution : '&copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributers'
  }), cyclemap = L.tileLayer('http://b.tile.thunderforest.com/cycle/{z}/{x}/{y}.png', {
    attribution : 'Maps &copy; <a href="http://www.thunderforest.com">Thunderforest, </a>;Data &copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }), elevationmap = L.tileLayer('http://b.tile.thunderforest.com/outdoors/{z}/{x}/{y}.png', {
    attribution : 'Maps &copy; <a href="http://www.thunderforest.com">Thunderforest, </a>;Data &copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }), transitmap = L.tileLayer(' http://{s}.tile.thunderforest.com/transport/{z}/{x}/{y}.png', {
    attribution : 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a>'
  });

  var baseMaps = {
    "RoadMap" : roadmap,
    "CycleMap" : cyclemap,
    "ElevationMap" : elevationmap,
    "TransitMap" : transitmap
  };

  var map = L.map('map', {
    zoom : $rootScope.geobase.zoom,
    zoomControl : false,
    layers : [ roadmap ],
    center : [ $rootScope.geobase.lat, $rootScope.geobase.lon ]
  });

  L.control.layers(baseMaps, null).addTo(map);

  $scope.route_instructions = '';

  var Locations = [];
  var mode = 'car';

  var icon = L.icon({
    iconUrl : 'resource/via_dot.png',

    iconSize : [ 38, 35 ], // size of the icon
    shadowSize : [ 50, 64 ], // size of the shadow
    iconAnchor : [ 22, 34 ], // point of the icon which will correspond to
    // marker's location
    shadowAnchor : [ 4, 62 ], // the same for the shadow
    popupAnchor : [ -3, -76 ]
  // point from which the popup should open relative to the iconAnchor
  });

  var mode_icons = {
    'car' : 'js/images/drive.png',
    'foot' : 'js/images/walk.png',
    'bicycle' : 'js/images/bike.png'
  };

  var getOriginIcon = function(icon) {
    return L.icon({
      iconUrl : 'resource/startmarker@2x.png',
      iconSize : [ 44, 56 ], // size of the icon
      iconAnchor : [ 22, 42 ]
    });
  };
  
  var getViaIcon = function(icon) {
    return L.icon({
      iconUrl : 'resource/via_dot.png',
      iconSize : [ 30, 30 ]
    });
  };

  var getDestinationIcon = function(icon) {
    return L.icon({
      iconUrl : 'resource/destmarker@2x.png',
      iconSize : [ 44, 56 ], // size of the icon
      iconAnchor : [ 22, 42 ]
    });
  };

  // allow hash links
  var hash = new L.Hash(map);
  var markers = [];

  var locateMarkers = [];
  var remove_markers = function() {
    for (i = 0; i < markers.length; i++) {
      map.removeLayer(markers[i]);
    }
    markers = [];
    locateMarkers.forEach(function (element, index, array) {
      map.removeLayer(element);
    });
    locateMarkers = [];
  };

  var parseHash = function() {
    var hash = window.location.hash;
    if (hash.indexOf('#') === 0)
      hash = hash.substr(1);
    return hash.split('&');
  };

  var parseParams = function(pieces) {
    var parameters = {};
    pieces.forEach(function(e, i, a) {
      var parts = e.split('=');
      if (parts.length < 2)
        parts.push('');
      parameters[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    });
    return parameters;
  };

  var force = false;
  var update = function(show, locs, costing) {
    // update the permalink hash
    var pieces = parseHash();
    var extra = '';
    pieces.forEach(function(e, i, a) {
      if (e.length && e.slice(0, 'locations='.length) != 'locations=' && e.slice(0, 'costing='.length) != 'costing=')
        extra = extra + (extra.length ? '&' : '') + e;
    });
    var parameter = (extra.length ? '&locations=' : 'locations=') + JSON.stringify(locs) + '&costing=' + JSON.stringify(costing);
    force = show;
    window.location.hash = '#' + extra + parameter;

    document.getElementById('permalink').innerHTML = "<a href='http://valhalla.github.io/demos/routing/index.html" + window.location.hash + "' target='_top'>Route Permalink</a>";
  };

  var hashRoute = function() {
    // something has to have changed for us to request again
    var parameters = parseParams(parseHash());
    if (!force && parameters.locations == JSON.stringify(locations))
      return;
    force = false;

    // shape
    var waypoints = [];
    if (parameters.locations !== undefined)
      waypoints = JSON.parse(parameters.locations);

    var locs = [];
    waypoints.forEach(function(waypoints) {
      locs.push(L.latLng(waypoints.lat, waypoints.lng));
    });

    if (parameters.costing !== undefined)
      var costing = JSON.parse(parameters.costing);

    var rr = L.Routing.control(
        {
          waypoints : locs,
          geocoder : null,
          transitmode : costing,
          routeWhileDragging : false,
          router : L.Routing.valhalla(envToken, 'auto'),
          summaryTemplate : '<div class="start">{name}</div><div class="info {transitmode}">{distance}, {time}</div>',

          createMarker : function(i, wp, n) {
            var iconV;
            if (i == 0) {
              iconV = getOriginIcon();
            } else {
              iconV = getDestinationIcon();
            }
            var options = {
              draggable : false,
              icon : iconV
            }
            var dot = L.marker(wp.latLng, options);
            return dot.bindPopup("<a href = http://www.openstreetmap.org/#map=" + $rootScope.geobase.zoom + "/" + $rootScope.geobase.lat + "/" + $rootScope.geobase.lon
                + "&layers=Q target=_blank>Edit POI here<a/>");
          },
          formatter : new L.Routing.Valhalla.Formatter(),
          pointMarkerStyle : {
            radius : 6,
            color : '#25A5FA',
            fillColor : '#5E6472',
            opacity : 1,
            fillOpacity : 1
          }
        }).addTo(map);

    document.getElementById('permalink').innerHTML = "<a href='http://valhalla.github.io/demos/routing/index.html" + window.location.hash + "' target='_top'>Route Permalink</a>";
  }

  // Number of locations
  var locations = 0;

  var reset = function() {
    $('svg').html('');
    $('.leaflet-routing-container').remove();
    $('.leaflet-marker-icon.leaflet-marker-draggable').remove();
    $scope.$emit('resetRouteInstruction');
    remove_markers();
    locations = 0;
  };

  $rootScope.$on('map.setView', function(ev, geo, zoom) {
    map.setView(geo, zoom || 8);
  });
  $rootScope.$on('map.dropMarker', function(ev, geo, m) {

    if (locations == 0) {
      var marker = new L.marker(geo, {
        icon : getOriginIcon(m || 'car')
      });
      marker.bindPopup("<a href = http://www.openstreetmap.org/#map=" + $rootScope.geobase.zoom + "/" + $rootScope.geobase.lat + "/" + $rootScope.geobase.lon
          + "&layers=Q target=_blank>Edit POI here<a/>");
    } else {
      var marker = new L.marker(geo, {
        icon : getDestinationIcon(m || 'car')
      });
      marker.bindPopup("<a href = http://www.openstreetmap.org/#map=" + $rootScope.geobase.zoom + "/" + $rootScope.geobase.lat + "/" + $rootScope.geobase.lon
          + "&layers=Q target=_blank>Edit POI here<a/>");
    }
    map.addLayer(marker);
    markers.push(marker);
  });
  $rootScope.$on('map.dropMultiLocsMarker', function(ev, geo, m) {

    if (locations == 0) {
      var marker = new L.marker(geo, {
        icon : getOriginIcon(m || 'car')
      });
      marker.bindPopup("<a href = http://www.openstreetmap.org/#map=" + $rootScope.geobase.zoom + "/" + $rootScope.geobase.lat + "/" + $rootScope.geobase.lon
          + "&layers=Q target=_blank>Edit POI here<a/>");
    } else {
      var marker = new L.marker(geo, {
        icon : getViaIcon(m || 'car')
      });
      marker.bindPopup("<a href = http://www.openstreetmap.org/#map=" + $rootScope.geobase.zoom + "/" + $rootScope.geobase.lat + "/" + $rootScope.geobase.lon
          + "&layers=Q target=_blank>Edit POI here<a/>");
    }
    map.addLayer(marker);
    markers.push(marker);
  });

  // locate edge snap markers
  var locateEdgeMarkers = function (locate_result) {
    // clear it
    locateMarkers.forEach(function (element, index, array) {
      map.removeLayer(element);
    });
    locateMarkers = []

    //mark from node
    if(locate_result.node != null) {
      var marker = L.circle( [locate_result.node.lat,locate_result.node.lon], 2, { color: '#444', opacity: 1, fill: true, fillColor: '#eee', fillOpacity: 1 });
      map.addLayer(marker);
      var popup = L.popup({maxHeight : 200});
      popup.setContent("<pre id='json'>" + JSON.stringify(locate_result, null, 2) + "</pre>");
      marker.bindPopup(popup).openPopup();      
      locateMarkers.push(marker);
    }//mark all the results for that spot
    else if(locate_result.edges != null) {
      locate_result.edges.forEach(function (element, index, array) {
        var marker = L.circle( [element.correlated_lat, element.correlated_lon], 2, { color: '#444', opacity: 1, fill: true, fillColor: '#eee', fillOpacity: 1 });
        map.addLayer(marker);
        var popup = L.popup({maxHeight : 200});
        popup.setContent("<pre id='json'>" + JSON.stringify(element, null, 2) + "</pre>"); 
        marker.bindPopup(popup).openPopup(); 
        locateMarkers.push(marker);
      });
    }//no data probably
    else {
      var marker = L.circle( [locate_result.input_lat,locate_result.input_lon], 2, { color: '#444', opacity: 1, fill: true, fillColor: '#eee', fillOpacity: 1 });
      map.addLayer(marker);
      var popup = L.popup({maxHeight : 200});
      popup.setContent("<pre id='json'>" + JSON.stringify(locate_result, null, 2) + "</pre>");
      marker.bindPopup(popup).openPopup();      
      locateMarkers.push(marker);
    }
  };

  $scope.renderHtml = function(html_code) {
    return $sce.trustAsHtml(html_code);
  };

  $scope.$on('setRouteInstruction', function(ev, instructions) {
    $scope.$apply(function() {
      $scope.route_instructions = instructions;
    });
  });

  $scope.$on('resetRouteInstruction', function(ev) {
    $scope.$apply(function() {
      $scope.route_instructions = '';
    });
  });

  // if the hash changes
  // L.DomEvent.addListener(window, "hashchange", hashRoute);

  // show something to start with but only if it was requested
  $(window).load(function(e) {
    // rr = L.Routing.valhalla(accessToken);
    force = true;
    hashRoute();
  });

  map.on('click', function(e) {
    var geo = {
      'lat' : e.latlng.lat,
      'lon' : e.latlng.lng
    };
    //way to test multi-locations
    if(event.ctrlKey) {
      if (locations == 0) {
        Locations.push({
          lat : geo.lat,
          lon : geo.lon
        })
        $rootScope.$emit('map.dropMultiLocsMarker', [ geo.lat, geo.lon ], mode);
        locations++;
        return;
      } else {
        Locations.push({
          lat : geo.lat,
          lon : geo.lon
        })
        $rootScope.$emit('map.dropMultiLocsMarker', [ geo.lat, geo.lon ], mode);
        locations++;
        return;
      }
    } else if (!event.shiftKey){
      if (locations == 0) {
        Locations.push({
          lat : geo.lat,
          lon : geo.lon
        })
        $rootScope.$emit('map.dropMarker', [ geo.lat, geo.lon ], mode);
        locations++;
        return;
      } else if (locations > 1) {
        Locations = [];
        reset();
  
        Locations.push({
          lat : geo.lat,
          lon : geo.lon
        })
        $rootScope.$emit('map.dropMarker', [ geo.lat, geo.lon ], mode);
        locations++;
        return;
      }
    }
    
    $scope.$on('setRouteInstruction', function(ev, instructions) {
      $scope.$apply(function() {
        $scope.route_instructions = instructions;
      });
    });

    $scope.$on('resetRouteInstruction', function(ev) {
      $scope.$apply(function() {
        $scope.route_instructions = '';
      });
    });

    var waypoints = [];
    Locations.forEach(function(gLoc) {
      waypoints.push(L.latLng(gLoc.lat, gLoc.lon));
    });
    
    waypoints.push(L.latLng(geo.lat, geo.lon));

    $rootScope.$emit('map.dropMarker', [ geo.lat, geo.lon ], mode);
    locations++;

    valhalla_mode = mode_mapping[mode];
    
    update(true, waypoints, valhalla_mode);

    var rr = L.Routing.control(
        {
          waypoints : waypoints,
          geocoder : null,
          transitmode : valhalla_mode,
          routeWhileDragging : false,
          router : L.Routing.valhalla(envToken, 'auto'),
          summaryTemplate : '<div class="start">{name}</div><div class="info {transitmode}">{distance}, {time}</div>',

          createMarker : function(i, wp, n) {
            var iconV;
            if (i == 0) {
              iconV = L.icon({
                iconUrl : 'resource/via_dot.png',
                iconSize : [ 30, 30 ]
              });
            } else {
              iconV = L.icon({
                iconUrl : 'resource/via_dot.png',
                iconSize : [ 30, 30 ]
              })
            }
            var options = {
              draggable : true,
              icon : iconV
            }
            var dot = L.marker(wp.latLng, options);
            return dot.bindPopup("<a href = http://www.openstreetmap.org/#map=" + $rootScope.geobase.zoom + "/" + $rootScope.geobase.lat + "/" + $rootScope.geobase.lon
                + "&layers=Q target=_blank>Edit POI here<a/>");
          },
          formatter : new L.Routing.Valhalla.Formatter(),
          pointMarkerStyle : {
            radius : 6,
            color : '#25A5FA',
            fillColor : '#5E6472',
            opacity : 1,
            fillOpacity : 1
          }
        }).addTo(map);
    
    var driveBtn = document.getElementById("drive_btn");
    var bikeBtn = document.getElementById("bike_btn");
    var walkBtn = document.getElementById("walk_btn");
    var multiBtn = document.getElementById("multi_btn");
    var elevationBtn = document.getElementById("elevation_btn");
    var clearBtn = document.getElementById("clear_btn");
    var routeresponse;

    driveBtn.addEventListener('click', function(e) {
      getEnvToken();
      rr.route({
        transitmode : 'auto'
      });
    });

    bikeBtn.addEventListener('click', function(e) {
      getEnvToken();
      var bikeoptions = setBikeOptions();
      rr.route({
        transitmode : 'bicycle',
        costing_options : bikeoptions
      });
    });

    walkBtn.addEventListener('click', function(e) {
      getEnvToken();
      rr.route({
        transitmode : 'pedestrian'
      });
    });

    multiBtn.addEventListener('click', function(e) {
      getEnvToken();
      rr.route({
        transitmode : 'multimodal',
        date_time : dateStr
      });
    });
    
    elevationBtn.addEventListener('click', function(e) {
      selectEnv();
      var elev = (typeof rr._routes[0] != "undefined") ? L.elevation(elevToken, rr._routes[0].rrshape) : 0;
      elev.resetChart();
      elev.profile(elev._rrshape);
      document.getElementById('graph').style.display = "block";
    });
    
    clearBtn.addEventListener('click', function(e) {
      Locations = [];
      waypoints = [];
      reset();
      var elev = (typeof rr._routes[0] != "undefined") ? L.elevation(elevToken, rr._routes[0].rrshape) : 0;
      elev.resetChart();
      document.getElementById('permalink').innerHTML = "";
      window.location.hash = "";
    });

    function setBikeOptions() {
      var btype = document.getElementsByName("btype");
      var bicycle_type = "Road";
      for (var i = 0; i < btype.length; i++) {
        if (btype[i].checked) {
          bicycle_type = btype[i].value;
        }
      }
      var use_roads = document.getElementById("use_roads").value;
      var cycling_speed = document.getElementById("cycle_speed").value;
      var use_hills = document.getElementById("use_hills").value;

      bikeoptions = {
        "bicycle" : {
          bicycle_type : bicycle_type,
          use_roads : use_roads,
          cycling_speed : cycling_speed,
          use_hills : use_hills
        }
      }
      return bikeoptions;
    }
    ;

    /*
     * function openWin(id) { var divText =
     * document.getElementById(id).innerHTML;
     * myWindow=window.open('','','height: 100; width:200;'); var doc =
     * myWindow.document; doc.open(); doc.write(divText); doc.close(); }
     */

    function datetimeUpdate(datetime) {
      var changeDt = datetime;
      var inputDate, splitDate, year, month, day, time, hour, minute;
      if (changeDt != null) {
        if (changeDt.length >= 11) {
          inputDate = changeDt.split(" ");
          splitDate = inputDate[0].split("-");
          day = splitDate[0];
          if (day < 10) {
            day = '0' + day;
          }
          month = GetMonthIndex(splitDate[1]) + 1;
          if (month < 10) {
            month = '0' + month;
          }
          year = splitDate[2];

          time = inputDate[1].split(":");
          hour = time[0];
          minute = time[1];

          dateStr = year + "-" + month + "-" + day + "T" + hour + ":" + minute;
        } else {
          dateStr = parseIsoDateTime(isoDateTime.toString());
        }
        multiBtn.click();
      }
    }
    ;

    $(document).on('mode-alert', function(e, m) {
      mode = m;
      reset();
      Locations = [];
    });

    $(document).on('route:time_distance', function(e, td) {
      var instructions = $('.leaflet-routing-container.leaflet-control').html();
      $scope.$emit('setRouteInstruction', instructions);
    });

    $("#datepicker").on("click", function() {
      datetimeUpdate(this.value);
    });
  });

  // ask the service for information about this location
  map.on("contextmenu", function(e) {
    var ll = {
      lat : e.latlng.lat,
      lon : e.latlng.lng
    };
    getEnvToken();
    var locate = L.locate(envToken);
    locate.locate(ll, locateEdgeMarkers);
  });

  $("#showbtn").on("click", function() {
    document.getElementById('options').style.display = "block";
  });

  $("#hidebtn").on("click", function() {
    document.getElementById('options').style.display = "none";
  });

  $("#hidechart").on("click", function() {
    document.getElementById('graph').style.display = "none";
  });
})
