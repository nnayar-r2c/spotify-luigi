function visualiserApp(luigi) {
    var templates = {};
    var invertDependencies = false;
    var typingTimer = 0;

    function loadTemplates() {
        $("script[type='text/template']").each(function(i, element) {
            var name = $(element).attr("name");
            var content = $(element).text();
            templates[name] = content;
        });
    }

    function renderTemplate(templateName, dataObject) {
        return $("<div>").html(Mustache.render(templates[templateName], dataObject));
    }


    function formatTime(dateObject) {
        return dateObject.getHours() + ":" + dateObject.getMinutes() + ":" + dateObject.getSeconds();
    }

    function taskToDisplayTask(showWorker, task) {
        var taskIdParts = /([A-Za-z0-9_]*)\((.*)\)/.exec(task.taskId);
        var taskName = taskIdParts[1];
        var taskParams = taskIdParts[2];
        var displayTime = new Date(Math.floor(task.start_time*1000)).toLocaleString();
        if (task.status == "RUNNING" && "time_running" in task) {
            var current_time = new Date().getTime();
            var minutes_running = Math.round((current_time - task.time_running * 1000) / 1000 / 60);
            displayTime += " | " + minutes_running + " minutes";
            if (showWorker && "worker_running" in task) {
              displayTime += " (" + task.worker_running + ")";
            }
        }
        return {
            taskId: task.taskId,
            taskName: taskName,
            taskParams: taskParams,
            priority: task.priority,
            resources: JSON.stringify(task.resources),
            displayTime: displayTime,
            displayTimestamp : task.start_time,
            trackingUrl: task.trackingUrl,
            status: task.status,
            graph: (task.status == "PENDING" || task.status == "RUNNING" || task.status == "DONE"),
            error: task.status == "FAILED",
            re_enable: task.status == "DISABLED" && task.re_enable_able
        };
    }

    function indexByProperty(tasks, fieldName) {
        indexedTasks = {};
        $.each(tasks, function(i, task) {
            if (!indexedTasks.hasOwnProperty(task[fieldName])) {
                indexedTasks[task[fieldName]] = [];
            }
            indexedTasks[task[fieldName]].push(task);
        });
        return indexedTasks;
    }

    function entryList(object) {
        var list = [];
        $.each(object, function(key, value) {
            list.push({key: key, value:value});
        });
        return list;
    }

    function renderTasks(tasks) {
        var displayTasks = tasks.map($.proxy(taskToDisplayTask, null, true));
        displayTasks.sort(function(a,b) { return b.displayTimestamp - a.displayTimestamp; });
        var tasksByFamily = entryList(indexByProperty(displayTasks, "taskName"));
        tasksByFamily.sort(function(a,b) { return a.key.localeCompare(b.key); });
        return renderTemplate("rowTemplate", {tasks: tasksByFamily});
    }

    function processWorker(worker) {
        worker.tasks = worker.running.map($.proxy(taskToDisplayTask, null, false));
        worker.start_time = new Date(worker.started * 1000).toLocaleString();
        worker.active = new Date(worker.last_active * 1000).toLocaleString();
        return worker;
    }

    function renderWorkers(workers) {
        return renderTemplate("workerTemplate", {"workers": workers.map(processWorker)});
    }

    function switchTab(tabId) {
        $(".tabButton").parent().removeClass("active");
        $(".tab-pane").removeClass("active");
        $("#"+tabId).addClass("active");
        $(".tabButton[data-tab="+tabId+"]").parent().addClass("active");
    }

    function showErrorTrace(error) {
        $("#errorModal").empty().append(renderTemplate("errorTemplate", error));
        $("#errorModal").modal({});
    }

    function processHashChange(paint) {
        var hash = location.hash;
        if (hash == "#w") {
            switchTab("workerList");
        } else if (hash) {
            var taskId = hash.substr(1);
            //$("#graphContainer").hide();
            //$(".live.map svg").empty();
            $("#searchError").empty();
            $("#searchError").removeClass();
            if (taskId != "g") {
                depGraphCallback = function(dependencyGraph) {
                    //$(".live.map svg").empty();
                    $("#searchError").empty();
                    $("#searchError").removeClass();
                    if(dependencyGraph.length > 0) {
                        $("#dependencyTitle").text(taskId);
                        if(dependencyGraph != '{}'){
                            //var json = JSON.parse(JSON.stringify(dependencyGraph));
                            //workers = json.response
                            
                            for (var id in dependencyGraph) {
                                if (dependencyGraph[id].deps.length > 0) {
                                    //console.log(asingInput(dependencyGraph, id));
                                    dependencyGraph[id]['inputQueue']=asingInput(dependencyGraph, id);
                                    dependencyGraph[id]['inputThroughput']=50;
                                    dependencyGraph[id]['count']=5;
                                    dependencyGraph[id]['consumers']=1;
                                }else{
                                    dependencyGraph[id]['inputThroughput']=50;
                                    dependencyGraph[id]['count']=5;
                                    dependencyGraph[id]['consumers']=1;
                                }
                            }
                        }
                      //$("#graphPlaceholder").get(0).graph.updateData(dependencyGraph);
                      //$("#graphContainer").show();
                      bindGraphEvents();
                    } else {
                      $("#searchError").addClass("alert alert-error");
                      $("#searchError").append("Couldn't find task " + taskId);
                    }
                    //console.log(dependencyGraph);
                    drawGraphETL(dependencyGraph, paint)
                }
                if (invertDependencies) {
                    luigi.getInverseDependencyGraph(taskId, depGraphCallback);
                } else {
                    luigi.getDependencyGraph(taskId, depGraphCallback);
                    
                }
            }
            switchTab("dependencyGraph");
        } else {
            switchTab("taskList");
        }
    }

    function bindGraphEvents() {
        $(".graph-node-a").click(function(event) {
            var taskId = $(this).attr("data-task-id");
            var status = $(this).attr("data-task-status");
            if (status=="FAILED") {
                event.preventDefault();
                luigi.getErrorTrace(taskId, function(error) {
                   showErrorTrace(error);
                });
            }
        });
    }

    function bindListEvents() {
        $(window).on('hashchange', processHashChange);
        $("#invertCheckbox").click(function() {
            invertDependencies = this.checked;
            processHashChange(true);
        });
        $("a[href=#list]").click(function() { location.hash=""; });
        $("#loadTaskForm").submit(function(event) {
            event.preventDefault();
            location.hash = $(this).find("input").val();
        });
    }

    function bindTaskEvents(id, expand) {
        $(id + " [data-action=expandTaskRows]").click(function(event) {
            event.preventDefault();
            var icon = $(this).find("span");
            if (icon.hasClass("icon-plus")) {
                icon.removeClass("icon-plus");
                icon.addClass("icon-minus");
            } else {
                icon.removeClass("icon-minus");
                icon.addClass("icon-plus");
            }
            var taskRows = $(this).closest(".taskFamily").find(".taskRows").slideToggle("fast");
        });
        if (expand) {
            $(id + " [data-action=expandTaskRows]").click();
        }
        $(id + " .error-trace-button").click(function() {
            luigi.getErrorTrace($(this).attr("data-task-id"), function(error) {
               showErrorTrace(error);
            });
        });
        $(id + " .re-enable-button").click(function() {
            var that = $(this);
            $(this).attr('disabled', true);
            luigi.reEnable($(this).attr("data-task-id"), function(data) {
                if (data.name) {
                  node = that.closest(".taskFamily").find(".badge-important");
                  cnt = parseInt(node.text());
                  cnt --;
                  node.text(cnt);
                  that.parent().parent().remove();
                }
            });
        });
    }

    function getTaskList(id, tasks, expand) {
        if (tasks.length == 1 && typeof(tasks[0]) === "number") {
            var length = tasks[0];
            var rendered = renderTemplate("rowCountTemplate", {'num_tasks': length});
            $(id).parent().addClass('emptyTaskGroup');
        } else {
            var length = tasks.length;
            var rendered = renderTasks(tasks);
        }
        $(id).append(rendered);
        $(id).prev("h3").append(" (" + length + ")");
        bindTaskEvents(id, expand);
        filterTasks();
    }

    function filterTasks() {
        inputVal = $('#filter-input').val();
        if (inputVal) {
            arr = inputVal.split(" ");
            // hide all columns first
            $('#taskList .taskRow').addClass('hidden');
            $('#taskList .taskRow').parent().parent().addClass('hidden');

            // unhide columns that matches filter
            attrSelector = arr.map(function(a) {
                return a ? '[data-task-id*=' + a + ']' : '';
            }).join("");
            selector = '.taskRow' + attrSelector;
            $(selector).removeClass('hidden');
            $(selector).parent().parent().removeClass('hidden');
        } else {
            $('#taskList .taskRow').removeClass('hidden');
            $('#taskList .taskRow').parent().parent().removeClass('hidden');
        }

        updateCount();
    }

    function updateCount() {
        taskGroups = $('#taskList .taskGroup:not(.emptyTaskGroup)');
        for (i=0; i<taskGroups.length; i++) {
            groupCount = 0;

            // update each task family
            taskFamilies = $(taskGroups[i]).find('.taskFamily');
            for (j=0; j<taskFamilies.length; j++) {
                cnt = $(taskFamilies[j]).find('.taskRow:not(.hidden)').length;
                groupCount += cnt;
                node = $(taskFamilies[j]).find(".badge-important");
                node.text(cnt);
            }

            // update task group
            newText = $(taskGroups[i]).find('h3').text().replace(/\d+/, groupCount);
            $(taskGroups[i]).find('h3').text(newText);
        }
    }

    function asingInput(worker, id){
        if (worker[id].deps.length > 0) {
            //console.log(worker[id].deps);
            return worker[id].deps;
        }
    }

    function getFinishTime(tasks, listId){
        var times = {};
        for (var i = 0; i < listId.length; i++) {
            for (var j = 0; j < tasks.length; j++) {
                if (listId[i]===tasks[j].taskId) {
                    var finishTime = new Date(tasks[i].time_running*1000);
                    var startTime = new Date(tasks[i].start_time*1000);
                    var durationTime = new Date((finishTime - startTime)*1000).getSeconds();
                    times[listId[i]] = durationTime;
                };
            };
        };
        return times;
    }
    function getParam(tasks, id){
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].taskId === id) {
                return tasks[i].worker_running;
            };
        };
    }
    function getStatusTasks(tasks){
        var status;
        for (var i = 0; i < tasks.length; i++) {
            if (tasks[i].status === "DONE") {
                status = true;
            }else{
                return false;
            }
        };
        return status;
    }
    function drawGraphETL(tasks, paint){
    // Set up zoom support
        var svg = d3.select("#mysvg");
        var inner = svg.select("g"),
            zoom = d3.behavior.zoom().on("zoom", function() {
            inner.attr("transform", "translate(" + d3.event.translate + ")" +
                "scale(" + d3.event.scale + ")");
            });
        svg.call(zoom);

        var render = new dagreD3.render();
        // Left-to-right layout
        var g = new dagreD3.graphlib.Graph();
        g.setGraph({
            nodesep: 70,
            ranksep: 50,
            rankdir: "LR",
            marginx: 20,
            marginy: 20,
            height: 400
        });

        function draw(isUpdate) {
            for (var id in tasks) {
                var task = tasks[id];
                var className = task.status;
                    
                var html = "<div onclick='window.location.href = \"" + "/static/visualiser/index.d3.html#" + task.taskId + "\"'>";
                html += "<span class=status></span>";
                html += "<span class=name>"+task.name+"</span>";
                html += "<span class=queue><span class=counter>"+ task.status +"</span></span>";
                html += "</div>";
                    
                g.setNode(task.taskId, {
                    labelType: "html",
                    label: html,
                    rx: 5,
                    ry: 5,
                    padding: 0,
                    class: className
                });
                if (task.inputQueue) {
                    for (var i =  0; i < task.inputQueue.length; i++) {
                        if (task.status === "DONE") {
                            var durationTime = getFinishTime(tasks, task.inputQueue);
                            g.setEdge(task.inputQueue[i], task.taskId, {
                                label: durationTime[task.inputQueue[i]] + " secs",
                                width: 40
                            });
                        }else{
                            g.setEdge(task.inputQueue[i], task.taskId, {
                                width: 40
                            });
                        }
                    };
                }
            }
            var styleTooltip = function(name, description) {
                return "<p class='name'>" + name + "</p><p class='description'>" + description + "</p>";
            };
            inner.call(render, g);
            if(paint){
                // Zoom and scale to fit
                var zoomScale = zoom.scale();
                var graphWidth = g.graph().width + 80;
                var graphHeight = g.graph().height + 40;
                var width = parseInt(svg.style("width").replace(/px/, ""));
                var height = parseInt(svg.style("height").replace(/px/, ""));
                zoomScale = Math.min(width / graphWidth, height / graphHeight);
                var translate = [(width/2) - ((graphWidth*zoomScale)/2), (height/2) - ((graphHeight*zoomScale)/2)];
                zoom.translate(translate);
                zoom.scale(zoomScale);
                zoom.event(isUpdate ? svg.transition().duration(3000) : d3.select("#mysvg"));
            }

            inner.selectAll("g.node")
                .attr("title", function(v) { return styleTooltip(v, getParam(tasks, v)) })
                .each(function(v) { $(this).tipsy({ gravity: "w", opacity: 1, html: true }); });
            }
            // Do some mock queue status updates
            
            if (getStatusTasks(tasks)) {
                console.log("clearInterval");
                clearInterval(interval);
            };
            draw();
    }
    var interval = setInterval(function() {
        processHashChange(false);
    }, 5000);

    $(document).ready(function() {
        loadTemplates();

        $('#filter-input').bind("keyup paste", function() {
            clearTimeout(typingTimer);
            if ($('#filter-input').val) {
                typingTimer = setTimeout(filterTasks, 300);
            }
        });

        luigi.getWorkerList(function(workers) {
            $("#workerList").append(renderWorkers(workers));
        });

        luigi.getRunningTaskList(function(runningTasks) {
            getTaskList("#runningTasks", runningTasks, true);
        });

        luigi.getFailedTaskList(function(failedTasks) {
            getTaskList("#failedTasks", failedTasks);
        });

        luigi.getUpstreamFailedTaskList(function(upstreamFailedTasks) {
            getTaskList("#upstreamFailedTasks", upstreamFailedTasks);
        });

        luigi.getDisabledTaskList(function(disabledTasks) {
            getTaskList("#disabledTasks", disabledTasks);
        });

        luigi.getUpstreamDisabledTaskList(function(upstreamDisabledTasks) {
            getTaskList("#upstreamDisabledTasks", upstreamDisabledTasks);
        });

        luigi.getPendingTaskList(function(pendingTasks) {
            getTaskList("#pendingTasks", pendingTasks);
        });

        luigi.getDoneTaskList(function(doneTasks) {
            getTaskList("#doneTasks", doneTasks);
        });

        bindListEvents();

        //var graph = new Graph.DependencyGraph($("#graphPlaceholder")[0]);
        //$("#graphPlaceholder")[0].graph = graph;
            
        processHashChange(true);
    });
}