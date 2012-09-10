var volare = volare || {};

(function() {
    var LatLng = google.maps.LatLng;
    var LatLngBounds = google.maps.LatLngBounds;

    var inherit = (function() {
        var Proxy = function() {
        };
        return function(clazz, parent) {
            Proxy.prototype = parent.prototype;
            clazz.prototype = new Proxy();
            clazz.super_ = parent.prototype;
            clazz.prototype.constructor = clazz;
        };
    })();

    function Flights() {
        this.flights = [];

        this.start = null;
        this.end = null;
        this.duration = 0;
        this.maxAltitude = 0;

        this.currentTime = null;
    }

    Flights.prototype.getFlights = function() {
        return this.flights;
    };

    Flights.prototype.addFlight = function(flight) {
        this.flights.push(flight);

        var start = flight.getStart();
        var end = flight.getEnd();

        this.start = this.start == null || this.start > start ? start : this.start;
        this.end = this.end == null || this.end < end ? end : this.end;
        this.duration = this.end - this.start;
        this.maxAltitude = Math.max(this.maxAltitude, flight.getMaxAltitude() + 100);

        $(this).trigger('properties_changed');
        $(this).trigger('flight_added', flight);
    };

    Flights.prototype.getCurrentTime = function() {
        return this.currentTime;
    };

    Flights.prototype.setCurrentTime = function(time) {
        this.currentTime = time;
        $(this).trigger('currenttime_changed', time);
    };


    function Flight(flight, color) {
        this.flight = flight;
        this.color = color;
        this.distances = [];
        this.polyline = null;
    }

    Flight.prototype.getStart = function() {
        return new Date(this.flight.records[0].time);
    };

    Flight.prototype.getEnd = function() {
        return new Date(this.flight.records[this.flight.records.length - 1].time);
    };

    Flight.prototype.getBounds = function() {
        return new LatLngBounds(new LatLng(this.flight.maxLatitude, this.flight.minLongitude),
                                new LatLng(this.flight.minLatitude, this.flight.maxLongitude));
    };

    Flight.prototype.getMaxAltitude = function() {
        return this.flight.maxAltitude;
    };

    Flight.prototype.getPositionAt = function(time) {
        var records = this.flight.records;
        if (!time)
            return records[0];

        var index = this._getRecordIndexAt(time);
        if (index >= records.length)
            index = records.length - 1;
        return records[index];
    };

    Flight.prototype.getGroundSpeedAt = function(time) {
        var self = this;
        return this._getSpeedAt(time, Flight.GROUND_SPEED_SAMPLING_DURATION, function(n) {
            var s = self.flight.records[n];
            var e = self.flight.records[n + 1];
            return self._getDistance(n)/((new Date(e.time) - new Date(s.time))/1000);
        });
    };

    Flight.prototype.getVerticalSpeedAt = function(time) {
        var self = this;
        return this._getSpeedAt(time, Flight.VERTICAL_SPEED_SAMPLING_DURATION, function(n) {
            var s = self.flight.records[n];
            var e = self.flight.records[n + 1];
            return (e.altitude - s.altitude)/((new Date(e.time) - new Date(s.time))/1000);
        });
    };

    Flight.prototype.setPolyline = function(map, currentTime) {
        if (this.polyline) {
            this.polyline.setMap(null);
            this.polyline = null;
        }

        var records = this.flight.records;
        if (currentTime) {
            var start = this._getRecordIndexAt(new Date(currentTime.getTime() - Flight.TRACK_DURATION*1000));
            var end = this._getRecordIndexAt(currentTime);
            records = records.slice(start, end + 1);
        }

        var path = new google.maps.MVCArray(_.map(records, function(record) {
            return new LatLng(record.latitude, record.longitude);
        }));
        this.polyline = new google.maps.Polyline({
            map: map,
            path: path,
            strokeColor: this.color
        });
    };

    Flight.prototype.drawAltitude = function(graph, currentTime) {
        var context = graph.context;

        context.strokeStyle = this.color;
        context.lineWidth = 2;

        context.beginPath();
        var startTime = this.getStart();
        var startAltitude = this.flight.records[0].altitude;
        context.moveTo(graph.getX(startTime), graph.getY(startAltitude));
        var lastAltitude = startAltitude;
        _.every(this.flight.records, function(record) {
            var time = new Date(record.time);
            if (currentTime != null && time > currentTime)
                return false;

            context.lineTo(graph.getX(time), graph.getY(record.altitude));
            lastAltitude = record.altitude;

            return true;
        });
        if (startTime <= currentTime)
            context.lineTo(graph.getX(currentTime), graph.getY(lastAltitude));
        context.stroke();
    };

    Flight.prototype.drawGroundSpeed = function(graph, currentTime) {
        var context = graph.context;

        context.strokeStyle = this.color;
        context.lineWidth = 2;

        context.beginPath();
        var startTime = this.getStart();
        var endTime = this.getEnd();
        context.moveTo(graph.getX(startTime), graph.getY(0));
        for (var time = startTime.getTime(); time < (currentTime || endTime).getTime(); time += 20*1000) {
            var t = new Date(time);
            context.lineTo(graph.getX(t), graph.getY(this.getGroundSpeedAt(t)*3600/1000));
        }
        context.stroke();
    };

    Flight.prototype._getRecordIndexAt = function(time) {
        return _.sortedIndex(this.flight.records, { time: time }, function(record) {
            return new Date(record.time);
        });
    };

    Flight.prototype._getSpeedAt = function(time, duration, f) {
        if (!time)
            return 0;

        var records = this.flight.records;
        var index = this._getRecordIndexAt(time);
        if (index <= 0 || records.length <= index)
            return 0;

        var start = this._getRecordIndexAt(new Date(time.getTime() - duration*1000));
        var end = this._getRecordIndexAt(new Date(time.getTime() + duration*1000));
        if (end >= records.length)
            end = records.length - 1;
        if (start === end) {
            start = index - 1;
            end = index;
        }
        var speeds = _.map(_.range(start, end), function(n) {
            return f(n);
        });
        return _.reduce(speeds, function(a, n) { return a + n; }, 0)/speeds.length;
    };

    Flight.prototype._getDistance = function(index) {
        var distance = this.distances[index];
        if (_.isUndefined(distance)) {
            distance = Flight.distance(this.flight.records[index], this.flight.records[index + 1]);
            this.distances[index] = distance;
        }
        return distance;
    };

    Flight.distance = function(p1, p2) {
        var r = 6378137;
        var dx = (p1.longitude - p2.longitude)/180*Math.PI;
        var y1 = p1.latitude/180*Math.PI;
        var y2 = p2.latitude/180*Math.PI;
        return r*Math.acos(Math.sin(y1)*Math.sin(y2) + Math.cos(y1)*Math.cos(y2)*Math.cos(dx));
    };

    Flight.TRACK_DURATION = 10*60;
    Flight.GROUND_SPEED_SAMPLING_DURATION = 10;
    Flight.VERTICAL_SPEED_SAMPLING_DURATION = 5;


    function Player(flights, player) {
        this.flights = flights;
        this.player = player;

        this.timer = null;

        var self = this;

        this.player.html('<div>' +
                         '<button class="play">Play</button>' +
                         '<button class="pause">Pause</button>' +
                         '<button class="stop">Stop</button>' +
                         '</div>' +
                         '<div class="slider"></div>');

        this.player.find('.play').button().on('click', _.bind(this.play, this));
        this.player.find('.pause').button().on('click', _.bind(this.pause, this));
        this.player.find('.stop').button().on('click', _.bind(this.stop, this));
        this.player.find('.slider').slider({
            range: 'min',
            min: 0,
            max: 100
        }).on('slide', function(event, ui) {
            self.flights.setCurrentTime(new Date(ui.value));
        });

        $(this.flights).on('currenttime_changed', function() {
            self._updateButtons();
            self._updateSliderValue();
        });
        $(this.flights).on('properties_changed', _.bind(this._updateSliderRange, this));

        this._updateButtons();
        this._updateSliderRange();
    }

    Player.prototype.play = function() {
        if (this.timer)
            return;

        var self = this;
        self.flights.setCurrentTime(this.flights.getCurrentTime() || this.flights.start);
        this.timer = setInterval(function() {
            var time = new Date(self.flights.getCurrentTime().getTime() + 10*1000);
            if (time > self.flights.end)
                self.stop();
            else
                self.flights.setCurrentTime(time);
        }, 100);

        this._updateButtons();
    };

    Player.prototype.pause = function() {
        if (!this.timer)
            return;

        clearInterval(this.timer);
        this.timer = null;

        this._updateButtons();
    };

    Player.prototype.stop = function() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.flights.setCurrentTime(null);

        this._updateButtons();
    };

    Player.prototype._updateButtons = function() {
        var buttons = {
            play: false,
            pause: false,
            stop: false
        };

        if (this.timer) {
            buttons.pause = true;
            buttons.stop = true;
        }
        else if (this.flights.getCurrentTime()) {
            buttons.play = true;
            buttons.stop = true;
        }
        else {
            buttons.play = true;
        }

        var self = this;
        _.each(buttons, function(v, k) {
            self.player.find('.' + k).button(v ? 'enable' : 'disable');
        });
    };

    Player.prototype._updateSliderRange = function() {
        var slider = this.player.find('.slider');
        slider.slider('option', 'min', this.flights.start ? this.flights.start.getTime() : 0);
        slider.slider('option', 'max', this.flights.end ? this.flights.end.getTime() : 0);

        this._updateSliderValue();
    };

    Player.prototype._updateSliderValue = function() {
        var slider = this.player.find('.slider');
        var time = this.flights.getCurrentTime();
        slider.slider('value', time ? time.getTime() : slider.slider('option', 'min'));
    };


    function Map(flights, map) {
        this.flights = flights;
        this.map = new google.maps.Map(map[0], {
            mapTypeId: google.maps.MapTypeId.TERRAIN
        });

        var self = this;
        $(this.flights).on('flight_added', function(event, flight) {
            self.map.fitBounds(flight.getBounds());
            flight.setPolyline(self.map);
        });
        $(this.flights).on('currenttime_changed', function(event, time) {
            _.each(self.flights.getFlights(), function(flight) {
                flight.setPolyline(self.map, time);
            });
        });
    }


    function Graph(flights, canvas) {
        this.flights = flights;
        this.canvas = canvas;
        this.width = canvas.width();
        this.height = canvas.height();

        var canvasElem = canvas[0];
        canvasElem.width = this.width;
        canvasElem.height = this.height;

        this.context = canvasElem.getContext('2d');

        var self = this;
        $(this.flights).on('flight_added', function(event, flight) {
            self._refresh();
        });
        $(this.flights).on('currenttime_changed', function(event, time) {
            self._refresh();
        });
    }

    Graph.prototype.getX = function(time) {
        return (time - this.flights.start)/this.flights.duration*(this.width - (Graph.MARGIN.left + Graph.MARGIN.right)) + Graph.MARGIN.left;
    };

    Graph.prototype.getY = function(value) {
        return this.height - (value - this._getMin())/this._getMax()*(this.height - (Graph.MARGIN.top + Graph.MARGIN.bottom)) - Graph.MARGIN.bottom;
    };

    Graph.prototype._refresh = function() {
        this.context.clearRect(0, 0, this.width, this.height);

        this._drawGrid();
        this._drawFlights();
    };

    Graph.prototype._drawGrid = function() {
        var startX = this.getX(this.flights.start);
        var endX = this.getX(this.flights.end);
        var lowestY = this.getY(this._getMin());
        var highestY = this.getY(this._getMax());

        var context = this.context;

        context.lineWidth = 0.1;
        context.strokeStyle = 'black';
        context.beginPath();
        context.moveTo(startX, lowestY);
        context.lineTo(startX, highestY);
        context.stroke();

        var time = new Date(this.flights.start);
        time.setMinutes(Math.floor(time.getMinutes()/10)*10);
        time.setSeconds(0);
        time = time.getTime() + 10*60*1000;
        context.textAlign = 'center';
        for (; time < this.flights.end.getTime(); time += Graph.TIME_STEP) {
            var t = new Date(time);

            var b = t.getMinutes() == 0 || t.getMinutes() == 30;
            context.strokeStyle = b ? 'black' : 'gray';

            var x = this.getX(time);
            context.beginPath();
            context.moveTo(x, lowestY);
            context.lineTo(x, highestY);
            context.stroke();
            if (b)
                context.fillText(Graph.formatTime(t), x, this.height - Graph.MARGIN.bottom + 12);
        }

        context.textAlign = 'end';
        var step = this._getValueStep();
        for (var value = this._getMin(); value < this._getMax(); value += step) {
            var b = this._isPrimaryValue(value);
            context.strokeStyle = b ? 'black' : 'gray';

            var y = this.getY(value);
            context.beginPath();
            context.moveTo(startX, y);
            context.lineTo(endX, y);
            context.stroke();

            context.fillText(this._formatValue(value), Graph.MARGIN.left - 4, y + 5);
        }

        context.stroke();
    };

    Graph.prototype._drawFlights = function() {
    };

    Graph.prototype._getMin = function() {
        return 0;
    };

    Graph.prototype._getMax = function() {
        return 1000;
    };

    Graph.prototype._isPrimaryValue = function(value) {
        return false;
    };

    Graph.prototype._getValueStep = function() {
        return (this._getMax() - this._getMin())/10;
    };

    Graph.prototype._formatValue = function(value) {
        return value;
    };

    Graph.MARGIN = {
        top: 0,
        left: 50,
        bottom: 15,
        right: 0
    };
    Graph.TIME_STEP = 10*60*1000;

    Graph.formatTime = function(time) {
        return _.sprintf("%02d:%02d", time.getHours(), time.getMinutes());
    }


    function AltitudeGraph(flights, canvas) {
        Graph.call(this, flights, canvas);
    }
    inherit(AltitudeGraph, Graph);

    AltitudeGraph.prototype._drawFlights = function() {
        var self = this;
        _.each(this.flights.getFlights(), function(flight) {
            flight.drawAltitude(self, self.flights.currentTime);
        });
    }

    AltitudeGraph.prototype._getMax = function() {
        return this.flights.maxAltitude;
    };

    AltitudeGraph.prototype._isPrimaryValue = function(value) {
        return value % 1000 === 0;
    };

    AltitudeGraph.prototype._getValueStep = function() {
        return AltitudeGraph.ALTITUDE_STEP;
    };

    AltitudeGraph.prototype._formatValue = function(value) {
        return value + 'm';
    };

    AltitudeGraph.ALTITUDE_STEP = 200;


    function SpeedGraph(flights, canvas) {
        Graph.call(this, flights, canvas);
    }
    inherit(SpeedGraph, Graph);

    SpeedGraph.prototype._drawFlights = function() {
        var self = this;
        _.each(this.flights.getFlights(), function(flight) {
            flight.drawGroundSpeed(self, self.flights.currentTime);
        });
    }

    SpeedGraph.prototype._getMax = function() {
        return 120;
    };

    SpeedGraph.prototype._isPrimaryValue = function(value) {
        return value % 50 === 0;
    };

    SpeedGraph.prototype._getValueStep = function() {
        return SpeedGraph.SPEED_STEP;
    };

    SpeedGraph.prototype._formatValue = function(value) {
        return value + 'km/h';
    };

    SpeedGraph.SPEED_STEP = 10;


    function Chart(flights, chart) {
        this.flights = flights;
        this.chart = chart;

        this.chart.html('<table><tbody>' +
                        '<tr>' +
                        '<th>Name</th>' +
                        '<th>Latitude</th>' +
                        '<th>Longitude</th>' +
                        '<th>Altitude</th>' +
                        '<th>Ground Speed</th>' +
                        '<th>Vertical Speed</th>' +
                        '</tr>' +
                        '</tbody></table>');

        var self = this;
        var row = _.template('<tr class="flight_<%- flight.id %>">' +
                             '<td class="name"><%- flight.name %></td>' +
                             '<td class="latitude"></td>' +
                             '<td class="longitude"></td>' +
                             '<td class="altitude"></td>' +
                             '<td class="ground_speed"></td>' +
                             '<td class="vertical_speed"></td>' +
                             '</tr>');
        $(this.flights).on('flight_added', function(event, flight) {
            var tbody = self.chart.find('tbody');
            tbody.append(row(flight));
            self._update();
        });
        $(this.flights).on('currenttime_changed', _.bind(this._update, this));
    }

    Chart.prototype._update = function() {
        var time = this.flights.getCurrentTime();
        var self = this;
        _.each(this.flights.getFlights(), function(flight) {
            var position = flight.getPositionAt(time);
            var tr = self.chart.find('.flight_' + flight.flight.id);
            tr.find('td.latitude').text(Chart.formatPosition(position.latitude));
            tr.find('td.longitude').text(Chart.formatPosition(position.longitude));
            tr.find('td.altitude').text(Chart.formatAltitude(position.altitude));
            tr.find('td.ground_speed').text(Chart.formatSpeed(flight.getGroundSpeedAt(time)));
            tr.find('td.vertical_speed').text(Chart.formatVerticalSpeed(flight.getVerticalSpeedAt(time)));
        });
    };

    Chart.formatPosition = function(p) {
        return _.sprintf('%.5f', p);
    };

    Chart.formatAltitude = function(a) {
        return a + 'm';
    };

    Chart.formatSpeed = function(s) {
        return _.sprintf('%.1fkm/h', s*3600/1000);
    };

    Chart.formatVerticalSpeed = function(s) {
        return _.sprintf('%.1fm/s', s);
    };


    volare.Flights = Flights;
    volare.Flight = Flight;
    volare.Player = Player;
    volare.Map = Map;
    volare.AltitudeGraph = AltitudeGraph;
    volare.SpeedGraph = SpeedGraph;
    volare.Chart = Chart;
})();
