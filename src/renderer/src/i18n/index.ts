import { createI18n } from 'vue-i18n'

const messages = {
  zh: {
    app: {
      void: 'Void',
      hud: 'HUD',
      logoAlt: 'MYTVHUD 管理器'
    },
    indicator: {
      menu: '菜单',
      matchs: '比赛',
      bp: 'BP 选图',
      intermission: '赛间播出',
      players: '选手',
      teams: '战队',
      settings: '设置'
    },
    common: {
      cancel: '取消',
      create: '创建',
      save: '保存',
      loadFailed: '加载失败',
      dbWriteFailed: '数据库写入失败',
      missingRequired: '缺少必填项',
      pleaseFill: '请填写：{fields}',
      deleteSuccess: '已删除',
      deleteFailed: '删除失败',
      recordNotFound: '记录不存在',
      upload: '上传',
      select: '选择',
      remove: '移除',
      readImageFailed: '读取图片失败，请重试',
      unsupportedFormat: '仅支持 PNG/JPEG/WebP 格式的图片',
      imageTooLarge: '图片超过 {size}MB，请压缩后再上传',
      avatarPreview: '头像预览',
      reset: '重置',
      submit: '提交',
      resetSuccess: '已重置',
      validateFailed: '校验失败',
      invalid: '输入内容无效',
      modifySuccess: '修改成功',
      addSuccess: '添加成功',
      saveFailed: '保存失败',
      enabled: '开启',
      disabled: '关闭'
    },
    teams: {
      createTitle: '创建战队',
      editTitle: '编辑战队',
      name: '队伍名称',
      nameIngame: '队伍名称（游戏内）',
      avatar: '队伍头像'
    },
    players: {
      createTitle: '创建选手',
      editTitle: '编辑选手',
      nickname: '昵称',
      steamid: 'SteamID',
      nicknamePlaceholder: '昵称 *',
      steamidPlaceholder: 'SteamID *',
      uploadAvatar: '上传头像',
      type: {
        player: '选手',
        coach: '教练',
        spectator: '观众'
      },
      toast: {
        createClosed: '创建选手表单已关闭',
        editClosed: '编辑选手表单已关闭',
        createSuccess: '创建成功',
        createFailed: '创建失败',
        updateSuccess: '更新成功',
        updateFailed: '更新失败'
      }
    },
    maps: {
      inferno: 'Inferno(炼狱小镇)',
      mirage: 'Mirage(荒漠迷城)',
      dust2: 'Dust2(炙热沙城2)',
      ancient: 'Ancient(远古遗迹)',
      nuke: 'Nuke(核子危机)',
      overpass: 'Overpass(死亡游乐园)',
      train: 'Train(列车停放站)',
      vertigo: 'Vertigo(殒命大厦)',
      anubis: 'Anubis(阿努比斯)',
      cache: 'Cache(死城之谜)',
      office: 'Office',
      cbble: 'Cobblestone'
    },
    matchForm: {
      map: '选择地图',
      pickBy: '选择选图方',
      team_a: {
        score: 'A 队比分'
      },
      team_b: {
        score: 'B 队比分'
      },
      decider: '决胜图'
    },
    multi: {
      matchForm: {
        title: '比赛表单',
        desc: '设置比赛双方、赛制与完整地图 BP；提交后由 BP 页面控制播出。',
        type: '赛制',
        teamA: '战队 A',
        teamB: '战队 B',
        mapNumber: '地图 {n}',
        selectTeamA: '选择战队 A',
        selectTeamB: '选择战队 B',
        selectMap: '选择地图',
        selectPicker: '选择选图方',
        pickTeams: '请选择战队 A 和战队 B',
        teamsUnique: '两支战队不能相同',
        mapsCountMismatch: '地图数量与赛制不一致',
        deciderNoPicker: '决胜图不能设置选图方',
        submitAndPrepare: '保存比赛并准备 BP',
        bp: {
          title: '地图 BP',
          desc: '按当前赛制的固定顺序完成 7 步禁选，第七步固定为决胜图。',
          mapHint: '每一步仅提供当前赛制允许的操作，每张地图只能使用一次。',
          emptySequence: '从左侧地图池开始添加 BP 步骤',
          banCount: '当前赛制必须包含 {count} 个禁用步骤。',
          pickCount: '当前赛制必须包含 {count} 个选择步骤。',
          prepared: 'BP 已准备并保持隐藏，请前往 BP 页面确认后点击显示。'
        },
        score: {
          title: '对局地图与比分',
          desc: '此处仅显示 BP 中选用的地图和决胜图，比分继续供比赛 HUD 使用。',
          empty: '完成地图 BP 后，这里将自动列出实际比赛地图。',
          status: '地图状态',
          legacyStatus: '此比赛来自旧版数据，地图状态已按“未开始”读取。请逐张确认后重新保存比赛。',
          onlyOneLive: '同一场比赛最多只能有一张地图处于“进行中”。',
          finishedTie: '{map} 的比分为平局，不能标记为“已结束”。'
        }
      },
      menu: {
        items: '{n} 项',
        goManage: '管理',
        lastMatch: '最近比赛',
        openMatchEditor: '打开比赛编辑'
      }
    },
    menu: {
      title: '菜单 - 安装与配置',
      step1: {
        title: '步骤 1：配置 GSI（重要）',
        content1_prefix: '在弹出的文件选择窗口中，选择',
        content1_suffix: '，将自动配置 GSI。'
      },
      step2: {
        title: '步骤 2：打开 Overlay',
        content1_beforeIcon: '打开 CS2，进入观察者模式，并点击右上角的',
        content1_afterIcon: '打开 HUD 映射。',
        content2_prefix: '在控制台中输入',
        content2_suffix: '隐藏游戏 HUD'
      },
      step3: {
        title: '步骤 3：配置 OBS',
        content1_prefix: '在 OBS 中添加一个新的浏览器源，URL 填写',
        content1_suffix: '，请确保浏览器源置于最上层。',
        content2: '设置浏览器源的高度、宽度为你的屏幕宽度，单位为 px。',
        content3_prefix: '地图 BP 使用单独的浏览器源，URL 填写',
        content3_suffix: '。',
        content4_prefix: '赛间信息条使用单独的浏览器源，URL 填写',
        content4_suffix: '。'
      }
    },
    intermission: {
      title: '赛间播出控制',
      loading: '正在读取赛间播出状态…',
      output: {
        visible: '正在显示',
        hidden: '当前隐藏',
        copy: '复制地址',
        open: '浏览器打开',
        show: '显示到 OBS',
        hide: '从 OBS 隐藏',
        refresh: '刷新',
        noValidMatch: '当前比赛数据不完整，请先在比赛页面完成设置。',
        noNextMap: '显示前必须先选择下一张地图。'
      },
      noMatch: {
        title: '尚无可用于赛间播出的当前比赛',
        desc: '请先在比赛页面保存双方、赛制、实际比赛地图、比分和地图状态。',
        action: '前往比赛设置'
      },
      match: {
        title: '当前比赛'
      },
      maps: {
        title: '地图状态',
        pickedBy: '{team} 选用',
        noPicker: '未记录选图方',
        finishedTie: '平局比分不能标记为已结束',
        statusNeedsConfirmation: '旧版记录：请确认并保存地图状态'
      },
      mapStatus: {
        pending: '未开始',
        live: '进行中',
        finished: '已结束'
      },
      nextMap: {
        title: '下一张地图',
        placeholder: '选择下一张地图',
        none: '尚未选择',
        seriesFinished: '当前系列赛已经结束，不能继续选择下一张地图。'
      },
      score: {
        title: '人工系列赛比分',
        desc: '仅用于弃权、判罚或技术性获胜。',
        automatic: '当前使用地图结果自动计算',
        manualActive: '当前正在使用人工比分',
        save: '保存比分模式'
      },
      timer: {
        title: '倒计时',
        minutes: '分钟',
        seconds: '秒',
        start: '开始',
        pause: '暂停',
        resume: '继续',
        reset: '重置',
        status: {
          idle: '待开始',
          running: '运行中',
          paused: '已暂停',
          finished: '已结束'
        }
      },
      layout: {
        title: 'OBS 布局',
        desc: '选择并拖动四个固定组件；画布坐标对应 1920×1080 OBS 浏览器源。',
        unapplied: '存在未应用修改',
        syncing: '正在同步至 OBS',
        onAirWarning: '正在播出',
        componentList: '固定 OBS 组件',
        fixedComponents: '仅支持以下四个固定组件，暂不支持手动添加。',
        selectedComponent: '当前组件：{name}',
        components: {
          teamScore: '战队与比分',
          mapSeries: '地图进度',
          timerNotice: '倒计时与提示',
          eventLogo: '右上角标志'
        },
        scale: '缩放（%）',
        liveSync: '实时同步到 OBS',
        undo: '撤销修改',
        reset: '重置默认',
        apply: '应用到 OBS',
        selectionLabel: '{name}位置与缩放选择框',
        resizeLabel: '缩放{name}'
      },
      toast: {
        loadFailed: '赛间状态加载失败',
        updateFailed: '赛间状态更新失败',
        requestTimedOut: '操作超过 8 秒未完成，请重试',
        layoutApplied: '布局已应用到 OBS',
        urlCopied: '赛间播出地址已复制',
        copyFailed: '复制地址失败'
      }
    },
    bp: {
      title: 'BP 选图',
      outputUrl: 'OBS 浏览器源',
      copyUrl: '复制 BP 展示地址',
      openOutput: '在浏览器中打开 BP 展示页',
      animation: '动画',
      startDisplay: '开始展示',
      hide: '隐藏',
      teamA: '战队 A',
      teamB: '战队 B',
      noMatch: {
        title: '尚未设置当前比赛',
        desc: '请先在比赛页面完成战队、赛制与全部 7 步 BP，并提交当前比赛。',
        action: '前往比赛设置'
      },
      readOnly: {
        title: '当前 BP 结果',
        desc: '此处仅用于核对和播出。BP 内容请在比赛页面修改。',
        editInMatch: '前往比赛页面修改',
        emptyTitle: '尚未准备 BP',
        emptyDesc: '请在比赛页面完成并提交 7 步 BP。',
        banResult: '{team} 禁用了此地图',
        pickResult: '{team} 选择了此地图',
        deciderResult: '最终决胜地图',
        sideResult: '{team} 选择 {side} 方开局',
        sidePending: '尚未设置开局阵营'
      },
      mapPool: '地图池',
      mapHint: '按当前赛制固定的禁用、选择与决胜图顺序完成 7 步。',
      deciderHint: '前六步已完成，请手动指定第七张决胜图。',
      added: '已加入',
      action: {
        ban: '禁用',
        pick: '选择',
        decider: '决胜图'
      },
      clear: '清除',
      removeStep: '删除该步骤',
      executingTeam: '执行战队',
      selectActorFirst: '请先选择选图战队',
      startingSide: '{team} 选择开局阵营',
      validation: {
        noMatch: '请先在比赛页面设置并提交当前比赛。',
        stepCount: '需要完成全部 7 个 BP 步骤。',
        decider: '第 7 步必须是决胜图。',
        actionOrder: '第 {step} 步必须为“{action}”。',
        actor: '第 {step} 步尚未选择执行战队。',
        side: '第 {step} 步尚未设置对方战队的开局阵营。'
      },
      toast: {
        loadFailed: 'BP 数据加载失败',
        saveFailed: 'BP 数据保存失败',
        incomplete: 'BP 信息尚未完成',
        cleared: 'BP 内容已清除',
        urlCopied: 'BP 展示地址已复制',
        copyFailed: '复制失败'
      }
    },
    settings: {
      manager: {
        title: '赛事名',
        seriesName_first: {
          label: '赛事名（#1）',
          desc: '赛事或任意你想要的名字',
          placeholder: '如：绵阳Major - 冬日余晖杯'
        },
        seriesName_second: {
          label: '赛事名（#2）',
          desc: '赛事或任意你想要的名字',
          placeholder: '如：淘汰赛 0-0'
        },
        seriesName_third: {
          label: '赛事名（#3）（不可用）',
          desc: '赛事或任意你想要的名字'
        }
      },
      overlay: {
        color: '颜色',
        title: 'UI 设置',
        focusedPlayer: {
          label: '当前聚焦选手',
          desc: '在 UI 中显示当前聚焦的选手'
        },
        sidebars: {
          label: '侧边栏',
          desc: '在 UI 中显示侧边栏'
        },
        topbar: {
          label: '顶部栏',
          desc: '在 UI 中显示顶部栏'
        },
        radar: {
          label: '雷达',
          desc: '在 UI 中显示雷达'
        },
        ctColor: {
          label: 'CT 颜色',
          desc: '反恐精英队伍的颜色'
        },
        tColor: {
          label: 'T 颜色',
          desc: '恐怖分子队伍的颜色'
        },
        borderRadius: {
          label: 'UI 圆角',
          desc: 'UI 的圆角'
        },
        row: '水平方向',
        column: '垂直方向',
        disabled: '禁用'
      },
      other: {
        title: '其他设置',
        shortcutKey: {
          label: '刷新快捷键',
          desc: '刷新 UI 快捷键（重启后生效）',
          modifiers: '组合键',
          key: '按键'
        }
      },
      toast: {
        saved: '设置已保存'
      },
      data: {
        title: '赛事数据',
        counts: '{teams} 支战队，{players} 名选手',
        open: {
          label: '本机数据目录',
          desc: '打开 MYTVHUD 的数据库和自动备份目录',
          action: '打开目录',
          failed: '打开数据目录失败'
        },
        exportPackage: {
          label: '导出数据',
          desc: '将全部战队、选手和头像打包为一个 MYTVHUD 数据包',
          action: '导出数据',
          running: '正在导出...',
          success: '数据导出成功',
          failed: '数据导出失败'
        },
        importPackage: {
          label: '导入数据',
          desc: '校验数据包并在自动备份后覆盖本机战队和选手数据',
          action: '导入数据',
          running: '正在导入...',
          success: '数据导入成功',
          failed: '数据导入失败'
        }
      }
    }
  }
}

export const i18n = createI18n({
  legacy: false,
  locale: 'zh',
  fallbackLocale: 'zh',
  messages
})
