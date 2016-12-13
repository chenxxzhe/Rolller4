/**
 * 检查浏览器是否支持transform
 */
$g.browserSupport = (function supportCheck() {
    var data = {
        prefix            : '',
        supportTransform  : false,
        supportTransform3d: false
    };
    data.supportTransform3d = ('WebKitCSSMatrix' in window && 'm11' in new WebKitCSSMatrix());
    var testElem = document.createElement('div'),
        style = testElem.style,
        prefix = ['webkit', 'Moz'];
    if (style.transform !== undefined) {
        data.supportTransform = true;
    } else {
        for (var i = 0, l = prefix.length; i < l; i++) {
            if (style[prefix[i] + 'Transform'] !== undefined) {
                data.supportTransform = true;
                data.prefix = prefix[i];
                break;
            }
        }
    }
    return data;
}());


/**

 * 创建动画状态管理器，动画渲染有transition完成，HTML结构是div.row 包裹内容，该管理器控制.row的状态
 * 一个roller原理上是只能管理同类div的动画，
 * @param  {Array}  rowSet   要管理的div
 * @param  {Object} rowState 总状态表
 * @param  {Number} time     动画时间，秒
 * @return {Object}          返回控制器对象roller,可以执行rollNext(),rollPrev,mapId(),mapLastId()
 * 以下是roller的属性与方法
 * @property {Function} onRollReady     准备阶段的回调
 * @property {Function} onRollStart     动画刚执行时的回调

 * @property {Function} onRollEnd       动画执行完的回调
 * @property {Array}    rowOrder        当前row的排列顺序
 * @property {Arrar}    rowOrderLast    上次row的排列顺序
 * @property {Boolean}  isRolling       是否在执行动画中，主要用于按键控制
 * @property {String}   transitionSyle  transition样式语句
 * @property {Array}    childSet        如果要控制子元素的样式动画，那么需要传入childSet，子元素数组的结构是同Row的在一个数组，最后全部嵌套在一个大数组[[div1_1, div1_2], [div2_1, div2_2]]
 * 每个child，必须有三个属性:currentState, totalState, state
 * @method rollNext     过渡到下一个状态，尽头会循环(currentState +1)
 * @method rollPrev     过渡到上一个状态，尽头会循环(currentState -1)
 * @method mapId        返回映射后的id，用于寻找焦点对应的元素。接受两个参数index:焦点的序号，从0开始；
 *                      columns:每row有几个columns
 * @method mapLastId    同上，不过返回的是滚动前的对应的id
 */
$g.createRollerAnimation = function(rowSet, rowState, time) {
    var roller = {};
    // 主要用于相同的元素被再次创建roller时的错位问题
    roller.rowSet = rowSet;
    roller.rowState = rowState;
    roller.rowOrder = [];
    roller.rowOrderLast = [];
    roller.defaultTime = 0.3;
    roller.rowTotalState = 0;

    (function() {
        var i = null, len = null;
        for (i = 0, len = rowSet.length; i < len; i++) {
            roller.rowOrder.push(i);
            roller.rowOrderLast.push(i);
        }

        roller.defaultTime = time ? time : 0.3;
        // 自动标记状态，从零开始
        for (i = len; i--;) {
            rowSet[i].currentState = i;
        }
        // 记录row的状态总数
        for (var p in rowState) {
            roller.rowTotalState = rowState[p].length;
            break;
        }

    }());

    roller._isInitiated = false;
    roller.isRolling = false;
    roller.transitionStyle = null;

    roller.onInitData = null;
    roller.onRollReady = null;
    roller.onRollEndUpdateData = null;
    roller.onRollStart = null;
    roller.onRollEnd = null;

    roller.childSet = null;

    // 用于debug
    roller.DEBUG = false;

    roller._log = function(msg) {
        if (this.DEBUG) {
            console.log.apply(this, arguments);
        }
    };

    // 拉平数组
    roller._flatArray = function(arr) {
        var flat = [];
        for (var i = arr.length; i--;) {
            flat = flat.concat(arr[i]);
        }
        return flat;
    };

    // 添加transition样式，相当于开启动画
    // XXX: 有多个元素transition时使用all会卡

    roller._setTransition = function(elem) {
        if (this.transitionStyle) {
            elem.style.transition = this.transitionStyle;
            elem.style.webkitTransition = this.transitionStyle;
            elem.style.MozTransition = this.transitionStyle;
        } else {
            elem.style.transition = 'all ' + this.defaultTime + 's ease-out';
            elem.style.webkitTransition = 'all ' + this.defaultTime + 's ease-out';
            elem.style.MozTransition = 'all ' + this.defaultTime + 's ease-out';
        }
    };
    roller._setTransitionAll = function() {
        for (var i = rowSet.length; i--;) {
            this._setTransition(rowSet[i]);
        }

    };
    roller._setChildTransitionAll = function() {
        if (this.childSet) {
            // 拉平数组再遍历
            var flatChildSet = this._flatArray(this.childSet);

            for (var i = flatChildSet.length; i--;) {
                this._setTransition(flatChildSet[i]);
            }
        }
    };
    // 清除transition样式，相当于关闭动画
    roller._cancelTransition = function(elem) {
        elem.style.transition = '';
        elem.style.webkitTransition = '';
        elem.style.MozTransition = '';
    };
    // 清除所有元素(row & childSet)的transition
    roller._cancelTransitionAll = function() {
        for (var i = rowSet.length; i--;) {
            this._cancelTransition(rowSet[i]);
        }
        if (this.childSet) {
            // 拉平数组再遍历
            var flatChildSet = this._flatArray(this.childSet);

            for (var i = flatChildSet.length; i--;) {
                this._cancelTransition(flatChildSet[i]);
            }
        }
    };

    // 根据state来更新elem样式
    var styleNeedToAddPX = ['left', 'top', 'width', 'height'];

    roller._updateStyles = function(elem, state) {
        if (elem.currentState === undefined) {
            throw new Error('Element currentState undefined');
        }
        if (isNaN(elem.currentState)) {
            throw new Error('Element currentState is NaN');
        }
        var styleText = '';
        for (var p in state) {
            if (styleNeedToAddPX.indexOf(p) !== -1) {
                styleText = state[p][elem.currentState] + 'px';
            } else {
                styleText = state[p][elem.currentState];
            }
            elem.style[p] = styleText;

        }
    };

    /**
     * 所有受控元素即刻刷新样式
     */
    roller.updateStylesAll = function() {
        for (var i = this.rowSet.length; i--;) {
            this._updateStyles(this.rowSet[i], rowState);
        }
        if (this.childSet) {
            var flatChildSet = this._flatArray(this.childSet);

            for (var i = flatChildSet.length; i--;) {
                this._updateStyles(flatChildSet[i], flatChildSet[i].state);
            }
        }
    };

    /**
     * 初始化数据,没有经过初始化的roller不能使用。
     * 这里做了两件事，根据state先初始化row的样式
     * 执行onInitData刷数据
     */
    roller.init = function() {
        // 貌似不限制多次init也没有问题

        // if (this._isInitiated) {
        //     throw new Error('Can not init twice');
        // }
        this._log('onInit');

        // 为了要用同样的元素重复创建roller的，每次都要复原元素样式
        var currentState = null;
        for (var i = rowSet.length; i--;) {
            for (var p in rowState) {
                if (rowState.hasOwnProperty(p)) {
                    currentState = rowSet[i].currentState;
                    var initialStyle = rowState[p][currentState];
                    if (typeof initialStyle === 'number' && (p === 'left' || p === 'top')) {
                        rowSet[i].style[p] = initialStyle + 'px';
                    } else {
                        rowSet[i].style[p] = initialStyle;

                    }

                }
            }
        }
        // 子元素也要复位
        if (this.childSet) {
            var flatArr = this._flatArray(this.childSet), child = null, state = null;

            for (var i = flatArr.length; i--;) {
                child = flatArr[i];
                state = child.state;
                for (var p in state) {
                    if (state.hasOwnProperty(p)) {
                        var initialChildStyle = state[p][child.currentState];
                        if (typeof initialChildStyle === 'number' && (p === 'left' || p === 'top')) {

                            child.style[p] = initialChildStyle + 'px';
                        } else {
                            child.style[p] = initialChildStyle;
                        }

                    }
                }
            }
        }

        // 更新数据
        if (this.onInitData) {
            this.onInitData(this);
        }

        this._isInitiated = true;
    };

    // 每次roll之前的准备
    roller._rollReady = function(isNext) {
        if (this._isInitiated === false) {
            throw new Error('Roller have not initiated yet');
        }
        this._log('onRollReady');
        if (this.onRollReady) this.onRollReady(this, isNext);

    };
    /**
     * 使元素过渡到下一个状态
     */
    roller._handleRollNext = function() {
        var rowOrder = this.rowOrder;
        var rowIndex, startStateIndex, endStateIndex;
        if (this.customAnimation) {
            // 自定义动画
            for (var i = 0, len = rowOrder.length; i < len; i++) {
                rowIndex = rowOrder[i];
                rowSet[rowIndex].currentState -= 1;
                startStateIndex = rowSet[rowIndex].currentState + 1;
                endStateIndex = startStateIndex - 1;
                if (rowSet[rowIndex].currentState > -1) {
                    this.customAnimation(rowSet[rowIndex], startStateIndex, endStateIndex, rowState, this.defaultTime);
                }
            }
        } else {
            // 默认transition动画

            // 开启动画，一定要确保动画只能在rollNext与rollPrev之内是开启的。
            this._setTransitionAll();

            // 全部换状态，刷样式
            for (var i = 0, len = rowOrder.length; i < len; i++) {
                rowIndex = rowOrder[i];
                // 准备行变为待转换状态，留待rollEnd时刷样式与数据
                rowSet[rowIndex].currentState -= 1;
                if (rowSet[rowIndex].currentState > -1) {
                    this._updateStyles(rowSet[rowIndex], rowState);


                }
            }
        }

        // 有childSet的话也要
        if (this.childSet) {
            var child;
            var flatChildSet = this._flatArray(this.childSet);

            if (this.customChildAnimation) {
                // 自定义动画
                for (var i = flatChildSet.length; i--;) {
                    child = flatChildSet[i];
                    child.currentState -= 1;
                    if (child.currentState > -1) {
                        this.customChildAnimation(child, child.currentState + 1, child.currentState, child.state, this.defaultTime);

                    }
                }
            } else {
                // 默认动画
                this._setChildTransitionAll();
                for (var i = flatChildSet.length; i--;) {
                    child = flatChildSet[i];
                    child.currentState -= 1;
                    if (child.currentState > -1) {
                        this._updateStyles(child, child.state);

                    }
                }
            }
        }

    };

    /**
     * 使元素过渡到上一个状态
     */
    roller._handleRollPrev = function() {

        var rowOrder = this.rowOrder;
        var totalState = this.rowTotalState;

        // row 的动画
        var rowIndex, startStateIndex, endStateIndex;
        if (this.customAnimation) {
            // 自定义动画
            for (var i = 0, len = rowOrder.length; i < len; i++) {
                rowIndex = rowOrder[i];
                rowSet[rowIndex].currentState += 1;
                startStateIndex = rowSet[rowIndex].currentState - 1;
                endStateIndex = startStateIndex + 1;
                if (rowSet[rowIndex].currentState < totalState) {
                    this.customAnimation(rowSet[rowIndex], startStateIndex, endStateIndex, rowState, this.defaultTime);
                }
            }
        } else {
            // 默认动画，原理是改变状态标记，然后根据标记来改样式
            this._setTransitionAll();
            for (var i = 0, len = rowOrder.length; i < len; i++) {
                rowIndex = rowOrder[i];
                rowSet[rowIndex].currentState += 1;
                if (rowSet[rowIndex].currentState < totalState) {
                    this._updateStyles(rowSet[rowIndex], rowState);

                }
            }
        }

        // child的动画
        if (this.childSet) {
            var child;
            var flatChildSet = this._flatArray(this.childSet);

            if (this.customChildAnimation) {
                // 自定义动画
                for (var i = flatChildSet.length; i--;) {
                    child = flatChildSet[i];
                    child.currentState += 1;
                    if (child.currentState < child.totalState) {
                        this.customChildAnimation(child, child.currentState - 1, child.currentState, child.state, this.defaultTime);

                    }
                }
            } else {
                // 默认动画
                this._setChildTransitionAll();
                for (var i = flatChildSet.length; i--;) {
                    child = flatChildSet[i];
                    child.currentState += 1;
                    if (child.currentState < child.totalState) {
                        this._updateStyles(child, child.state);

                    }
                }
            }
        }
    };

    roller._roll = function(isNext) {

        if (this.isRolling) {
            this._log('Do nothing when rolling');
            return;
        }
        // 滚动开始前的处理
        this._log('roll ' + (isNext ? 'next' : 'prev'));

        roller._rollReady(isNext);

        this.isRolling = true;

        // 开始滚动，分为Next和Prev
        if (isNext) {
            this._handleRollNext();
        } else {
            this._handleRollPrev();
        }

        // 下一个状态的预处理
        // 更新备用的元素
        this._prepareSpareState();
        // 动画刚开始时的回调
        if (this.onRollStart) this.onRollStart(this, isNext);
        // 动画结束后才能执行结束回调
        var that = this;
        setTimeout(function() {
            that._rollEnd(isNext);
        }, this.defaultTime * 1000);

    };
    roller.rollNext = function() {
        this._roll(true);
    };
    roller.rollPrev = function() {
        this._roll(false);
    };


    // 为了可以在动画刚开始时调用onRollStart，并且mapId得到正确结果
    roller._prepareSpareState = function() {
        // 每次roll后，将处于待转换状态(0或者len，有且只有一个处于该状态)的row,转换到备用状态，并更新rowOrder队列
        var len = rowSet.length;
        var rowIndex, targetRow;
        this._targetShouldBeUpdate = {}; // 用于后面移到准备位置

        for (var i = len; i--;) {
            targetRow = rowSet[i]; // current row
            // 遍历rowset，找出待转换行
            if (targetRow.currentState <= -1) {
                // roll next
                targetRow.currentState = this.rowTotalState - 1;

                this.rowOrderLast = this.rowOrder.slice(0);
                rowIndex = this.rowOrder.shift();
                this.rowOrder.push(rowIndex);
                break; // 每次roll后只会有一个row是待转换状态
            } else if (targetRow.currentState >= this.rowTotalState) {
                // row prev
                targetRow.currentState = 0;

                this.rowOrderLast = this.rowOrder.slice(0);
                rowIndex = this.rowOrder.pop();
                this.rowOrder.unshift(rowIndex);
                break;
            }
        }
        this._targetShouldBeUpdate.targetRow = targetRow;
        this._targetShouldBeUpdate.targetRowIndex = rowIndex;
        // this._updateStyles(cr, rowState);

        // 有childSet的话也要
        if (this.childSet) {
            var targetChild, totalState;
            var flatChildSet = this._flatArray(this.childSet);
            // 找出待转换状态的childSet

            for (var i = flatChildSet.length; i--;) {
                targetChild = flatChildSet[i];
                totalState = targetChild.totalState;
                if (targetChild.currentState <= -1) {
                    targetChild.currentState = totalState - 1;
                    break;
                } else if (targetChild.currentState >= totalState) {
                    targetChild.currentState = 0;
                    break;
                }
            }
            this._targetShouldBeUpdate.targetChild = targetChild;
        }
    };


    // 更新备用样式
    roller._updateSpareStyle = function() {
        var targetRow = this._targetShouldBeUpdate.targetRow;
        var targetChild = this._targetShouldBeUpdate.targetChild;
        this._updateStyles(targetRow, rowState);

        if (targetChild) {
            this._updateStyles(targetChild, targetChild.currentState);
        }
    };

    // 每次roll之后的处理
    roller._rollEnd = function(isNext) {
        this._log('roll end handle');
        // 清除动画
        this._cancelTransitionAll();

        // 备用item的样式这里更新，关键是关闭了transition后更新
        this._updateSpareStyle();

        // 刷新变换了位置的行的数据
        if (this.onRollEndUpdateData) {
            var rowShouldBeUpdated = this._targetShouldBeUpdate.targetRowIndex;

            this.onRollEndUpdateData(rowShouldBeUpdated, isNext);
        } else {
            throw new Error('roller\'s onRollEndUpdateData is undefined');
        }

        // 可能是底层问题导致，动画渲染的时间线与理想的不一致，这里应该还有更好的处理方法
        // 目的就是为了确保结束处理 完成后 才能够进行开下一次的roll
        var that = this;
        setTimeout(function() {
            that.isRolling = false; // 所有结束处理完成后才是真正的roll完
            that._log('onRollEnd');
            if (that.onRollEnd) that.onRollEnd(that, isNext);

        }, 50);

    };

    /**
     * 返回映射后的正确index,从0开始计数
     * @param  {Number} index   当前焦点的序号,从0开始计数
     * @param  {Number} columns 总共有多少列
     * @return {Number}         映射后的index
     *
     * FIXME: 这里跟焦点系统耦合了！！！！
     *
     */
    roller.mapId = function(index, columns) {
        if (typeof index !== 'number' || isNaN(index)) {throw new Error('mapId param "index" should be number, current is ' + index);}
        if (columns === undefined) {throw new Error('columns is undefined');}
        var fixedIndex = this.rowOrder[1] * columns + index;
        var total = columns * this.rowOrder.length;
        if (fixedIndex > total - 1) fixedIndex -= total;
        return fixedIndex;
    };

    roller.mapLastId = function(index, columns) {
        if (typeof index != 'number' || isNaN(index)) {throw new Error('mapId param "index" should be number, current is ' + index);}
        if (columns === undefined) {throw new Error('columns is undefined');}
        var fixedIndex = this.rowOrderLast[1] * columns + index;
        var total = columns * this.rowOrder.length;
        if (fixedIndex > total - 1) fixedIndex -= total;
        return fixedIndex;
    };

    // 最后返回roller
    return roller;
};


/**
 * createRowElements 创建适用于Roller的多个元素排列如下
 * (div.row>(img#id + ...))*rows
 * @param {Object} config 元素排列的配置，见下面
 * @return {String} innerHTML 排列好的元素的innerHTML,直接放在wrapper里面渲染
 */

$g.createRowElements = function(config) {
    // var config = {
    //     rows:           4,
    //     columns:        6,
    //     rowTop:         10,
    //     rowLeft:        10,
    //     rowXSpace:      20,
    //     rowYSpace:      20,
    //     childTag:       ['img','div'],
    //     chilId:         ['myimg', 'mytitle'],
    //     childTop:       [10, 10],
    //     childLeft:      [10, 10],
    //     childXSpace:    [10, 10],
    //     childYSpace:    [10, 10],
    // }
    var html = '';
    var rows = config.rows,
        columns = config.columns,
        rowTop = config.rowTop,
        rowLeft = config.rowLeft,
        rowXSpace = config.rowXSpace,
        rowYSpace = config.rowYSpace,
        childTag = [].concat(config.childTag),
        childId = [].concat(config.childId),
        childTop = [].concat(config.childTop || 0),
        childLeft = [].concat(config.childLeft || 0),
        childXSpace = [].concat(config.childXSpace || 0),
        childYSpace = [].concat(config.childYSpace || 0),
        rowClassName = config.rowClassName || 'row';

    var oneRow, rowContext;
    // 创建每行的元素
    for (var i = 0; i < rows; i++) {
        oneRow = '<div class=${class} style="position:absolute;left:${left}px;top:${top}px;">\n';
        rowContext = {
            class: rowClassName,
            left : rowLeft + i * rowXSpace,
            top  : rowTop + i * rowYSpace
        };
        oneRow = $g.stringFormat(oneRow, rowContext);
        // 创建每列的元素
        for (var j = 0; j < columns; j++) {
            // 创建同一格内各元素
            var unit, unitContext;
            for (var k = 0, l = childTag.length; k < l; k++) {
                unit = '<div style="position:absolute;left:${left}px;top:${top}px;"><${tag} id="${id}"></${tag}></div>\n';

                unitContext = {
                    tag : childTag[k],
                    id  : childId[k] + (i * columns + j),
                    left: childLeft[k] + j * childXSpace[k],
                    top : childTop[k] + j * childYSpace[k]
                };
                oneRow += $g.stringFormat(unit, unitContext);
            }
        }
        oneRow += '</div> \n';
        html += oneRow;
    }

    return html;
};

/**

 * 基于createRollerAnimation封装的轮播管理对象,本质是循环的rollPager
 * 传入元素数组与状态，调用init后就可以start
 * @param  {Array} rows 包含图片的rows元素，每row作为一个滚动的单位，一个row可以包含多个Img
 * @param  {Array} imgs 所以图片元素数组，按顺序排
 * @param  {Object} state   动画的状态设置,属性名要与css一致
 * @example
 * var state = {top:[1,2,3], left:[4,5,6]}
 * @param  {Array} data 数据对象组成的数组，必须要有src属性 {src: xxx}
 * 使用方法：
 * 1.创建元素，设定好样式状态state，数据data
 * 2.调用$g.createCarousel(rows, imgs, state, data).
 * 3.调用carousel.init(page) 在指定页开始，默认0
 * 4.调用carousel.start(time, isNext, animateTime), 开始轮播动画;
 * 5.调用carousel.stop()停止轮播动画;
 * 6.调用carousel.roll(isNext)手动滚动;
 * 7.调用carousel.rolleTo(dataCursor)手动跳到指定数据位置，没有动画
 */

$g.createCarousel = function(rows, imgs, state, data) {
    // 一行有几列
    var columns = Math.ceil(imgs.length / rows.length),
        EMPTY = 'data:image/png,f';

    if (rows.length > Math.ceil(data.length / columns)) {
        throw new Error('数据太少，rows太多，不能创建carousel');
    }

    var roller = $g.createRollerAnimation(rows, state);

    // 将imgs分入rows
    var imgsGroup = (function() {
        var arr = [];
        for (var i = 0, l = rows.length; i < l; i++) {
            arr[i] = [];
            for (var c = 0, cl = columns; c < cl; c++) {
                arr[i].push(imgs[i * columns + c]);
            }
        }
        return arr;
    }());

    // 将数据分组
    var dataGroups = (function() {
        var arr = [];
        // 每组有columns个数据
        for (var r = 0, rl = Math.ceil(data.length / columns); r < rl; r++) {
            arr[r] = [];
            for (var c = 0, cl = columns; c < cl; c++) {
                // 最后一行数据不是铺满的情况
                if (r * columns + c < data.length) {
                    arr[r].push(data[r * columns + c]);
                } else {
                    arr[r].push({src: EMPTY});
                }
            }
        }
        return arr;
    }());

    var carousel = {
        rows                : rows,
        imgs                : imgs,
        // 每个Row里面的img为一组
        imgsGroup           : imgsGroup,
        data                : data,
         // 每个row里面的data为一组
        dataGroups          : dataGroups,
        dataGroupsCursor    : 0,
        lastDataGroupsCursor: 0,
        onRollReady         : null,
        onRollStart         : null,
        onRollEnd           : null,
        _isInitiated        : false
    };

    roller.onInitData = function(roller) {
        roller._log('onInitData');
        // 由于是循环播放，因此全部row都要刷数据
        // 先刷其他行
        var startCursor = carousel.dataGroupsCursor,
            colIndex = 0,
            count = 0; // 辅助计数
        for (var i = 1, l = rows.length; i < l; i++) {
            for (var c = 0, cl = columns; c < cl; c++) {
                colIndex = i * columns + c;
                if (startCursor + i < dataGroups.length) {
                    imgs[colIndex].src = dataGroups[startCursor + i][c].src;
                } else {
                    imgs[colIndex].src = dataGroups[count][c].src;
                    if (c === columns - 1) count += 1;
                }
            }
        }
        // 再刷第一行
        for (var i = 0, l = columns; i < l; i++) {
            // 这里利用上一步的count
            imgs[i].src = dataGroups[count][i].src;
        }
    };
    roller.onRollReady = function(roller) {
        if(carousel.onRollReady) carousel.onRollReady(carousel);
    }
    roller.onRollStart = function(roller, isNext) {
        if (carousel.onRollStart) carousel.onRollStart(carousel, isNext);
    };
    roller.onRollEnd = function(roller, isNext) {
        if (carousel.onRollEnd) carousel.onRollEnd(carousel, isNext);
    };

    roller.onRollEndUpdateData = function(rowIndex, isNext) {
        this._log('onRollEndUpdateData');
        // 先找数据
        var updateData = carousel.dataGroups[carousel.dataGroupsCursor];
        // 再显示数据
        for (var i = 0, l = columns; i < l; i++) {
            imgs[rowIndex * columns + i].src = updateData[i].src;
        }

    };
    /**
     * 初始化，可指定数据index
     * @param {Number} cursor  指定数据作为第一个显示
     */
    carousel.init = function(cursor) {
        if (!cursor) cursor = 0;
        if (typeof cursor !== 'number') throw new Error('cursor must be number');
        this._isInitiated = true;
        roller._log('carousel init');
        this.dataGroupsCursor = cursor || 0;
        if (cursor < 0) {
            this.dataGroupsCursor = 0;
        } else if (cursor >= dataGroups.length) {
            this.dataGroupsCursor = dataGroups.length - 1;
        }
        roller.init();
    };

    /**
     * 滚动到上一个状态
     */
    carousel.rollPrev = function() {
        if (!this._isInitiated) {
            throw new Error('roll前要先init');
        }
        // 动画过程中不能再执行
        if (roller.isRolling) return;
        this.lastDataGroupsCursor = this.dataGroupsCursor;
        this.dataGroupsCursor -= 1;
        if (this.dataGroupsCursor < 0) {
            this.dataGroupsCursor = this.dataGroups.length - 1;
        }
        roller.rollPrev();
    };
    /**
     * 滚动到下一个状态
     */
    carousel.rollNext = function() {
        if (!this._isInitiated) {
            throw new Error('roll前要init');
        }
        if (roller.isRolling) return;
        this.lastDataGroupsCursor = this.dataGroupsCursor;
        this.dataGroupsCursor += 1;
        if (this.dataGroupsCursor >= this.dataGroups.length) {
            this.dataGroupsCursor = 0;
        }
        roller.rollNext();
    };


    /**
     * 跳到指定数据位置
     * @param  {Number} dataCursor 要跳到的数据位置，从零开始
     */
    carousel.rollTo = function(cursor) {
        roller._log('roll to dataGroup:', cursor);

        // 直接Init
        carousel.init(cursor);

    };

    /**
     * 开始轮播
     * @param  {Number}   time              间歇的毫秒
     * @param  {Bollean}  next              轮播的方向
     * @param  {Number}   animDuration      毫秒，动画运行的时间
     */
    carousel.start = function(interval, isNext, animDuration) {
        if (!this._isInitiated) {
            throw new Error('start前要调用init');
        }
        // 先清除遗留的定时任务
        if (this._clock) clearTimeout(this._clock);
        roller._log('carousel start ');

        interval = interval || 5000;
        isNext = isNext === undefined ? true : isNext;
        if (animDuration) {
            roller.defaultTime = animDuration / 1000;
        }

        function play() {
            roller._log('carousel roll repeatly');
            if (isNext) {
                carousel.rollNext();
            } else {
                carousel.rollPrev();
            }
            carousel._clock = setTimeout(play, interval);
        }

        this._clock = setTimeout(play, interval);


    };

    /**
     * 停止轮播
     */
    carousel.stop = function() {
        roller._log('carousel stop');
        if (this._clock) clearTimeout(this._clock);
    };

    carousel.getCursor = function() {
        return this.dataGroupsCursor;
    };
    carousel.getLastCursor = function() {
        return this.lastDataGroupsCursor;
    };
    carousel.getCurrentItems = function() {
        return this.dataGroups[this.dataGroupsCursor];
    };
    carousel.getCurrentRow = function() {
        return rows[roller.rowOrder[1]];
    };
    carousel.getLastRow = function() {
        return rows[roller.rowOrderLast[1]];
    };
    carousel.getRowOrder = function() {
        return roller.rowOrder;
    };
    carousel.getCurrentImgs = function() {
        return this.imgsGroup[roller.rowOrder[1]];
    };
    carousel.getLastImgs = function() {
        return this.imgsGroup[roller.rowOrderLast[1]];
    };
    carousel.isRolling = function() {
        return roller.isRolling;
    }

    carousel.debug = function() {
        roller.DEBUG = true;

    };

    return carousel;
};


/**
 * createPageRoller - 对roller的封装，用于竖向与横向的单行滚动效果，可代替原来$g.Pager来使用
 * @constructor
 * @param  {Array} rowSet 行元素的数组，滚动的基本单位，要按顺序排列
 * @param  {Array} imgSet 每行内部的子元素，用于承载图片，现阶段只支持一column一个图片
 * @param  {Object} state 动画状态设定，格式为{top:[],left:[]....}
 * @param  {Array} data   数据对象组成的数组，格式为[{src:..},{src:..}];每个对象必须要有src属性
 * @param  {Number} jsAnimationFPS 如果设定了就使用js动画，但仅支持left top
 * 另外可以给实例挂上onRollReady, onRollStart, onRollEnd
 */
$g.createPageRoller = function(rowSet, imgSet, state, data, jsAnimationFPS) {

    var roller = $g.createRollerAnimation(rowSet, state);
    // roller.DEBUG = true;
    var pager = {
        rowSet: rowSet,
        imgSet: imgSet,
        data  : data
    };
    var isInitiated = false,
        EMPTY = 'data:image/png,f',
        // showRows = rowSet.length - 1,
        columns = imgSet.length / rowSet.length;

    // 首页从0开始，本质是当前最左面数据的Index
    pager.currentPage = 0;
    // totalPage表示要多少Row才能读完数据
    pager.totalPage = Math.floor(data.length / columns);
    // onInitData刷数据时的回调，每一个元素回调一次
    // 回调自带参数: img, dataIndex(不一定存在),rowIndex
    pager.onRollInit = null;
    // 滚动刷数据时的回调，该封装已经自动完成了刷图部分
    // 回调自带参数: img, dataIndex(不一定存在),rowIndex,isNext
    pager.onRollUpdate = null;
    // 滚动前的准备回调
    pager.onRollReady = null;
    // 滚动刚开始时的回调
    pager.onRollStart = null;
    // 滚动完后的回调
    pager.onRollEnd = null;

    // 用于记录哪个元素使用了哪个数据
    pager._dataIndexMapToImg = {};

    pager.EMPTY = EMPTY;

    /**
     * init - 初始化pageRoller，可输入起始页面，必须初始化之后才能使用pageRoller
     *
     * @param  {Number} initPage 在哪一页开始初始化，默认首页0
     */
    pager.init = function (initPage) {
        if (typeof initPage !== 'number') {
            initPage = 0;
        }
        initPage = initPage < 0 ? 0 : initPage > this.totalPage - 1 ? this.totalPage - 1 : initPage;
        this.currentPage = initPage || 0;
        isInitiated = true;
        roller.init();
        return this;
    };

    // 根据currentPage来初始化数据
    roller.onInitData = function() {
        var i = 0,
            startIndex = pager.currentPage * columns,
            initTotal = (rowSet.length - 1) * columns,
            len = data.length,
            _dataIndexForCallback, rowIndex;
        for (; i < initTotal; i++) {
            if (i + startIndex < len) {
                imgSet[i + columns].src = data[i + startIndex].src;
                // 记录数据位于哪个元素上
                pager._dataIndexMapToImg[i + startIndex] = imgSet[i + columns];
                // 用于回调
                _dataIndexForCallback = i + startIndex;
            } else {
                imgSet[i + columns].src = EMPTY;
                _dataIndexForCallback = null;
            }
            // 回调
            rowIndex = Math.floor(i / columns);
            if (pager.onRollInit) pager.onRollInit(imgSet[i + columns], _dataIndexForCallback, rowIndex);
        }
        // 不是首页的话，要刷第一行
        if (pager.currentPage > 0) {
            startIndex = (pager.currentPage - 1) * columns;
            for (i = 0; i < columns; i++) {
                imgSet[i].src = data[i + startIndex].src;
                // 回调
                if (pager.onRollInit) pager.onRollIni(imgSet[i], i+startIndex, 0);
            }
        }

    };

    // 封装了更新数据的逻辑
    roller.onRollEndUpdateData = function(rowIndex, isNext) {
        var imgIndex = rowIndex * columns,
            len = data.length,
            i, dataIndex,
            _indexForCallbck;
        // 翻下一页，更新最后的row
        if (isNext) {
            i = 0;
            dataIndex = (pager.currentPage + rowSet.length - 2) * columns;
            for (;i < columns; i++) {
                if (i + dataIndex < len) {
                    imgSet[imgIndex + i].src = data[i + dataIndex].src;
                    // 记录数据位于哪个元素上
                    pager._dataIndexMapToImg[i + dataIndex] = imgSet[imgIndex + i];
                    _indexForCallbck = i + dataIndex;
                } else {
                    imgSet[imgIndex + i].src = EMPTY;
                    _indexForCallbck = null;
                }
                // 更新每一个元素都有回调
                if (pager.onRollUpdate) pager.onRollUpdate(imgSet[imgIndex + i], _indexForCallbck, rowIndex, isNext);
            }
        } else {
            // 翻上一页，更新第一个row
            i = 0;
            dataIndex = (pager.currentPage - 1) * columns;
            // 更新row下每一个img
            for (;i < columns; i++) {
                if (i + dataIndex >= 0) {
                    imgSet[imgIndex + i].src = data[i + dataIndex].src;
                    // 记录数据位于哪个元素上
                    pager._dataIndexMapToImg[i + dataIndex] = imgSet[imgIndex + i];
                    _indexForCallbck = i + dataIndex;
                } else {
                    imgSet[imgIndex + i].src = EMPTY;
                    _indexForCallbck = null;
                }
                // 更新每一个元素都有回调
                if(pager.onRollUpdate) pager.onRollUpdate(imgSet[imgIndex+i], _indexForCallbck, rowIndex, isNext);

            }
        }
    };
    roller.onRollReady = function(roller) {
        if(pager.onRollReady) pager.onRollReady(pager);
    }
    roller.onRollStart = function(roller, isNext) {
        if (pager.onRollStart) pager.onRollStart(pager, isNext);
    };
    roller.onRollEnd = function(roller, isNext) {
        if (pager.onRollEnd) pager.onRollEnd(pager, isNext);

    };

    /**
     * rollNext - 翻到下一页
     */
    pager.rollNext = function() {
        if (!isInitiated) throw new Error('pageRoller还没初始化');
        if (roller.isRolling) {
            // 滚动中不允许再滚动
            return this;
        }
        if (this.currentPage + 1 < this.totalPage) {
            // 页面限制
            this.currentPage += 1;
            roller.rollNext();
        }
        return this;
    };

    /**
     * rollPrev - 翻到上一页
     */
    pager.rollPrev = function() {
        if (!isInitiated) throw new Error('pageRoller还没初始化');
        if (roller.isRolling) {
            return this;
        }
        if (this.currentPage - 1 >= 0) {
            this.currentPage -= 1;
            roller.rollPrev();
        }
        return this;
    };

    /**
     * rollTo - 翻到指定页，现阶段不支持该动画
     * @param  {Number} page 要去到的指定行
     * TODO: 实现多行滚动的动画
     */
    pager.rollTo = function(page) {
        if (!isInitiated) throw new Error('pageRoller还没初始化');
        page = page < 0 ? 0 : page > this.totalPage - 1 ? this.totalPage - 1 : page;
        // console.log(page)
        this.currentPage = page;
        roller._cancelTransitionAll();
        // 重新刷数据

        var rowIndex,
            dataCursor = (page - 1) * columns,
            imgIndex,
            len = data.length;
        // 逐行更新
        for (var i = 0, l = rowSet.length; i < l; i++) {
            rowIndex = roller.rowOrder[i];
            imgIndex = rowIndex * columns;
            for (var j = 0; j < columns; j++) {
                if (dataCursor < len && dataCursor >= 0) {
                    imgSet[j + imgIndex].src = data[dataCursor].src;
                    // 记录数据位于哪个元素上
                    pager._dataIndexMapToImg[dataCursor] = imgSet[j + imgIndex];
                } else {
                    imgSet[j + imgIndex].src = EMPTY;
                }
                dataCursor++;
            }
        }
        return this;
    };

    /**
     * getCurrentItems - 获取当前页的data，
     * 当前行指处于当前row的Imgset
     * @param  {Number} rows 获取当前行到rows行的数据数组，默认为1
     * @return {Array}  数据数组
     */
    pager.getCurrentItems = function (rows) {
        if (!isInitiated) throw new Error('pageRoller还没初始化');
        var r = rows || 1;
        var start = this.currentPage * columns,
            end = (this.currentPage + r) * columns;
        return data.slice(start, end);
    };

    /**
     * getCurrentPage - 获取当前页的页数，从0计算
     * @return {Number}  当前是哪一页
     */
    pager.getCurrentPage = function () {
        return this.currentPage;
    };

    /**
     * getTotalPage - 获取总页数，从0计算
     * @return {Number}  总页数
     */
    pager.getTotalPage = function() {
        return this.totalPage;
    };

    /**
     * getCurrentImg - 获取当前焦点对应的实际元素
     *
     * @param  {Number} index           当前焦点Index,从0算起
     * @return {DOMElementObject}       查找到的实际元素
     *
     * FIXME: 这里其实和焦点系统耦合了
     */
    pager.getCurrentImg = function(index) {
        return imgSet[roller.mapId(index, columns)];
    };

    /**
     * getLastElement - 获取当前焦点 翻页前 对应的实际元素，
     *
     * @param  {type} index             当前焦点Index，从0算起
     * @return {DOMElementObject}       查找到的实际元素
     */
    pager.getLastImg = function(index) {
        return imgSet[roller.mapLastId(index, columns)];
    };

    pager.getCurrentRow = function() {
        return rowSet[roller.rowOrder[1]];
    };
    pager.getLastRow = function() {
        return rowSet[roller.rowOrderLast[1]];
    };
    pager.getRowOrder = function() {
        return roller.rowOrder;
    };

    /**
     * getImgByDataIndex - 根据数据的位置获取该数据所在的元素
     * 如果还没使用上该数据，就返回null
     * @param   {Number}    dataIndex   数据的index
     * @return  {DOMElement || null}    DOM元素
     */
    pager.getImgByDataIndex = function(dataIndex) {
        return pager._dataIndexMapToImg[dataIndex];
    };

    /**
     * isRolling - 检查是否滑动过程中
     */
    pager.isRolling = function() {
        return roller.isRolling;
    };

    /**
     * 替代transition的js动画，仅仅支持left,top过渡
     * @param   {Number}    fps         每秒多少帧
     * @return  {Function}  jsAnimation 用于替代transition的js动画函数
     */
    pager.jsMoveAnimation = function(fps) {
        return function(target, startStateIndex, endStateIndex, state, duration) {
            fps = fps || 30;
            // 默认30的fps
            var px = 'px';
            duration *= 1000;
            if (!state.left && !state.top) {
                throw new Error('state must have left or top');
            }
            var startX = 0,
                endX = 0,
                startY = 0,
                endY = 0,
                diffX = 0,
                diffY = 0,
                stepX = 0,
                stepY = 0;
            if (state.left) {
                startX = state.left[startStateIndex];
                endX = state.left[endStateIndex];
                diffX = endX - startX;
                stepX = diffX / (duration * fps / 1000);
            }
            if (state.top) {
                startY = state.top[startStateIndex];
                endY = state.top[endStateIndex];
                diffY = endX - startY;
                stepY = diffY / (duration * fps / 1000);

            }
            var style = target.style,
                count = 0,
                interval = 1000 / fps,
                times = 1;
            var move = function() {
                if (state.left) style.left = startX + stepX * times + px;
                if (state.top) style.top = startY + stepY * times + px;
                if (count < duration) {
                    count += interval;
                    times += 1;
                    setTimeout(move, interval);
                } else {
                    if (state.left) style.left = endX + px;
                    if (state.top) style.top = endY + px;
                }
            };
            move();
        };
    };
    if (jsAnimationFPS) {
        roller.customAnimation = pager.jsMoveAnimation(jsAnimationFPS);
    }

    return pager;
};

// ************* util ********************//


/**
 * 格式化字符串，占位符是${variable}
 * @param  {String} str     要格式化的字符串
 * @param  {Object} context 数据对象
 * @return {String}         代入数据后的字符串
 * @example
 * var result = stringFomat('my name is ${name}', {name: 'chenzhe'})
 * console.log(result) // 'my name is chenzhe'
 */
$g.stringFormat = function(str, context) {
    var reg = /\$\{.+?\}/g;
    var result = str.replace(reg, function(match, current, origin) {
        var key = match.substring(2, match.length - 1);
        return context[key] || '';
    });
    return result;

};
