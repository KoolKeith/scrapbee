import {BookTree} from "./tree.js";
import {settings} from "./settings.js"
import {SimpleDropdown} from "./control.js"
import {genItemId} from "./utils.js"

function initMover(){
    var mulitCheck;
    $("#multi-select").change(function(){
        mulitCheck = this.checked;
        
        if(tree0)
            tree0.showCheckBoxes(this.checked)
        if(tree1)
            tree1.showCheckBoxes(this.checked)
    });
    var saveingLocked = false;
    var tree0, tree1;
    browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if(request.type == 'RDF_EDITED'){
	    if(request.rdf == tree0.rdf){
                var $box = $("#tree0");
                if($box.is(":visible"))alert("{SAME_RDF_MODIFIED}".translate());
                loadXml(tree0.rdf, $box, 0)
	    }else if(request.rdf == tree1.rdf){
                var $box = $("#tree1");
                if($box.is(":visible"))alert("{SAME_RDF_MODIFIED}".translate());
                loadXml(tree1.rdf, $box, 1)
            }
        }
    });
    $(".uncheckall-button").each(function(i){
        $(this).click(function(){
            var tree = i == 0 ? tree0 : tree1;
            tree.unCheckAll();
        });
    });
    function refresh(tree){
        return new Promise((resolve, reject) => {
            var treeId = tree == tree0 ? 0 : 1;
            var expended_ids = [];
            tree.$top_container.find(".item.folder.expended").each(function(){
                expended_ids.push(this.id)
            });
            loadXml(tree.rdf, $("#tree" + treeId), treeId).then(() => {
                expended_ids.forEach((id) => {
                    tree.toggleFolder(tree.getItemById(id), true)
                    tree.showCheckBoxes(mulitCheck);
                });
                resolve();
            });
        });
    }
    $(".delete-button").each(function(i){
        $(this).click(async function(){
            var tree = i == 0 ? tree0 : tree1;
            var other = i == 0 ? tree1 : tree0;
            var proceed = false;
            function cfm(){
                proceed = proceed || confirm("{ConfirmDeleteItem}".translate());
                return proceed;
            }
            if($("#multi-select").is(":checked")){
                tree.getCheckedItemsInfo(1).every(function(info){
                    if(info.checkLevel == 0){
                        if(!cfm())return false;
                        tree.removeItem($(info.domElement));
                    }
                    return true;
                });
            }else{
                var $foc = tree.getFocusedItem();
                if($foc.length){
                    if(cfm())tree.removeItem($foc);
                }
            }
            if(proceed){
                await tree.saveXml();
            }
            if(tree0.rdf == tree1.rdf){
                refresh(other);
            }
        });
    });
    $("#node-mover .tool-button").prop("disabled", true);
    $("#node-mover .tool-button").click(async function(){
        var rightward = $(this).hasClass("rightward");
        var srcTree = rightward ? tree0 : tree1;
        var destTree = rightward ? tree1 : tree0;
        var moveType = $(this).hasClass("copy") ? "FS_COPY" : "FS_MOVE";
        /** src node */
        var $foc = srcTree.getFocusedItem();
        // var [type, introNode] = srcTree.getLiNodeType(liXmlNode)
        /** get rdf item id (none folder)*/
        var $foc_dest = destTree.getFocusedItem()
        var ref_id;
        if($foc_dest.length && !$foc_dest.hasClass("folder")){
            ref_id = $foc_dest.attr("id");
        }
        /** process src nodes */
        saveingLocked = true;
        var parents = [destTree.getCurrContainer()];
        var topNodes = [];
        var topInfos = [];
        var mode_multi = false;
        if($("#multi-select").is(":checked")){
            srcTree.getCheckedItemsInfo(1).forEach(function(item){
                if(item.checkLevel == 0){
                    topNodes.push(item.node);
                    topInfos.push({id:item.id, type:item.type, domElement:item.domElement})
                }
            });
            if(!topNodes.length)
                return alert("{NO_SOURCE_NODE_SELECTED}".translate());    
        }else{
            var id = $foc.attr("id");
            var type = srcTree.getItemType($foc);
            var domElement = $foc[0]
            if(!id)
                return alert("{NO_SOURCE_NODE_SELECTED}".translate());    
            var liXmlNode = srcTree.getItemXmlNode(id);
            topNodes.push(liXmlNode);
            topInfos.push({id, type, domElement})
        }
        /** operation validate */
        if($foc_dest.length && srcTree.rdf == destTree.rdf && moveType == "FS_MOVE"){
            try{
                topInfos.forEach(function(r){ /** check every top level src nodes */
                    if(r.type == "folder"){
                        var dest_type = destTree.getItemType($foc_dest);
                        if(dest_type == "folder"){ /** ref = src folder, means move src folder as its child */
                            if($foc_dest[0].id == r.id){
                                throw Error("{ERROR_MOVE_FOLER_INTO_ITSELF}".translate());
                            }     
                        }else{ /** rdf = descendant of src folder, means move src folder as its descendant */
                            if($foc_dest.closest($(`#${r.id}`).next(".folder-content")).length){
                                console.log(r.id)
                                throw Error("{ERROR_MOVE_FOLER_INTO_ITSELF}".translate());
                            }
                        }
                    }
                });
            }catch(e){
                return alert(e.message)
            }
        }
        /** show  waiting dialog */
        var waitingDlg = new DialogWaiting();
        waitingDlg.show();
        await srcTree.iterateLiNodes(function(item){
            return new Promise((resolve, reject) => {
                var $dest = parents[item.level];
                var id = genItemId();
                var rid = item.level == 0 ? ref_id : null;
                if(item.nodeType == "bookmark" || item.nodeType == "page"){
                    var src = srcTree.rdf_path + 'data/' + item.id;
                    var dest = destTree.rdf_path + 'data/' + id;
                    browser.runtime.sendMessage({type: moveType, src, dest}).then((response) => {
                        var icon = item.icon.replace(item.id, id)
                        destTree.createLink($dest, item.type, id, rid, item.source, icon, item.title, false, true);
                        resolve()
                    }).catch((e) => {
                        saveingLocked = false;
                    });
                }else if(item.nodeType == "seq"){
                    destTree.createFolder($dest, id, rid, item.title, true);
                    parents[item.level+1]=(destTree.getItemById(id).next(".folder-content"))
                    resolve()
                }else if(item.nodeType == "separator"){
                    destTree.createSeparator($dest, id, rid, true);
                    resolve();
                }
                if(item.level == 0) ref_id = id;
            });
        }, topNodes);
        /** saving changes */
        saveingLocked = false;
        if(tree0.rdf == tree1.rdf){
            if(moveType == "FS_MOVE"){
                topInfos.forEach((info) => {
                    destTree.removeItem(destTree.getItemById(info.id)); /** remove src nodes */
                });
            }
            await destTree.saveXml();
            refresh(srcTree); /** sync src tree */
        }else{
            if(moveType == "FS_MOVE"){
                topInfos.forEach((info) => {
                    srcTree.removeItem(srcTree.getItemById(info.id));
                });
            }
            await srcTree.saveXml();
        }
        waitingDlg.hide();
    });
    var selected_rdfs = [];
    $(".drop-box").each(function(i){
        var $label = $(this).find(".label") 
        var drop = new SimpleDropdown(this, [], false);
        var paths = settings.getRdfPaths();
        drop.clear()
        drop.onchange=function(title, value){
            selected_rdfs[i] = value;
            var $box = $("#tree" + i);
            $label.html(title || "");
            $box.html("");
            $.post(settings.backend_url + "isfile/", {path: value}, function(r){
                if(r == "yes"){
                    loadXml(value, $box, i);
                    $("#node-mover .tool-button").prop("disabled", !selected_rdfs[1]);
                }
            })
            $box.next(".path-box").html("/");
            $("#node-mover .tool-button").prop("disabled", true);
        };
        if(paths){
            var names = settings.getRdfPathNames(); 
	    names.forEach(function(n, i){
                drop.addItem(n, paths[i]);
	    });
            drop.select(names[0], paths[0]);
        }
    });
    function loadXml(rdf, $box, treeId){
        return new Promise((resolve, reject) => {
            var xmlhttp=new XMLHttpRequest();
            xmlhttp.onload = async function(r) {
	        var currTree = new BookTree(r.target.response, rdf, {checkboxes: $("#multi-select").is(":checked")})
                if(treeId == 0)
                    tree0 = currTree
                else if(treeId == 1)
                    tree1 = currTree
	        await currTree.renderTree($box);
	        currTree.onChooseItem=function(itemId){
                    var t = currTree.getItemPath(currTree.getItemById(itemId))
                    $box.next(".path-box").html(`<bdi>${t}</bdi>`)
	        }
                currTree.saveXml=currTree.onDragged=function(){
                    return new Promise((resolve, reject) => {
                        if(!saveingLocked){
                            browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: currTree.xmlSerialized(), path: currTree.rdf}).then((response) => {
                                browser.runtime.sendMessage({type: 'RDF_EDITED', rdf: currTree.rdf}).then((response) => {});
                                resolve();
                            });
                        }else{
                            reject()
                        }
                    });
	        }
                resolve();
            };
            xmlhttp.onerror = function(err) {
	        log.info(`load ${rdf} failed, ${err}`)
            };
            xmlhttp.open("GET", settings.backend_url + "file-service/" + rdf, false);
            xmlhttp.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
            xmlhttp.setRequestHeader('cache-control', 'max-age=0');
            xmlhttp.setRequestHeader('expires', '0');
            xmlhttp.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
            xmlhttp.setRequestHeader('pragma', 'no-cache');
            xmlhttp.send();
        });
    }
}
export {initMover}
