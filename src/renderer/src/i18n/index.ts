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
      restartRequired: '设置已更改，但是需要重启客户端后生效。',
      relaunchNow: '立即重启',
      notNow: '暂不'
    },
    teams: {
      createTitle: '创建战队',
      editTitle: '编辑战队',
      name: '队伍名称',
      nameIngame: '队伍名称（游戏内）',
      type: '队伍类型',
      avatar: '队伍头像'
    },
    players: {
      createTitle: '创建选手',
      editTitle: '编辑选手',
      nickname: '昵称',
      realname: '真实姓名',
      steamid: 'SteamID',
      cameraUrl: '摄像头地址',
      nicknamePlaceholder: '昵称 *',
      realnamePlaceholder: '真实姓名',
      steamidPlaceholder: 'SteamID *',
      cameraPlaceholder: '摄像头地址',
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
        deciderNoPicker: '决胜图不能设置选图方'
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
        content2: '设置浏览器源的高度、宽度为你的屏幕宽度，单位为 px。'
      }
    },
    settings: {
      manager: {
        title: '赛事名',
        seriesName_first: {
          label: '赛事名（#1）',
          desc: '赛事或任意你想要的名字'
        },
        seriesName_second: {
          label: '赛事名（#2）',
          desc: '赛事或任意你想要的名字'
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
      managerSettings: {
        title: '管理器设置',
        acrylic: {
          label: '毛玻璃特效（不可用）',
          desc: '开启 Windows 毛玻璃（Acrylic）背景'
        },
        acrylicShortcut: {
          label: '毛玻璃快捷键',
          desc: '用于切换毛玻璃的全局快捷键（重启后生效）'
        }
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
