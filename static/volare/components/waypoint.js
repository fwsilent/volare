define([
    'lodash',
    'jquery',
    'angular',
    'volare/volare',
    'text!./waypoint.css',
    'text!./waypoint.html',
    'volare/util'
], function(_, $, angular, volare, css, template) {
    'use strict';

    var waypoint = angular.module('volare.components.waypoint', [
        'volare.util'
    ]);

    waypoint.directive('volareWaypoint', ['$http', 'util', function($http, util) {
        util.loadCssInline(css);

        return {
            restrict: 'E',
            replace: true,
            template: template,
            scope: {
                map: '='
            },
            controller: ['$scope', function($scope) {
                var map = $scope.map;

                $scope.waypoints = [];
                $scope.waypoint = null;

                $scope.$watch('waypoint', function(waypoint) {
                    if (waypoint) {
                        $http.get('/waypoints/' + waypoint.id).success(function(waypoint) {
                            map.setWaypoint(volare.Waypoint.wrap(waypoint));
                        });
                    }
                    else {
                        map.setWaypoint(null);
                    }
                });

                $(map).on('waypoint_changed', function(event, waypoint) {
                    $scope.waypoint = waypoint ? _.find($scope.waypoints, function(w) {
                        return w.id === waypoint.getId();
                    }) : null;
                });

                $http.get('/waypoints').success(function(waypoints) {
                    $scope.waypoints = waypoints;
                });
            }]
        };
    }]);

    return waypoint;
});
