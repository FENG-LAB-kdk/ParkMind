/**
 * 全国园区分布数据 —— 供「园区分布」地图页使用
 *
 * 【业务设定】ParkMind 是一个园区运营集团,在全国运营多个园区。
 * 这个模块给管理层看"全国园区分布与运营态势":每个园区带规模、设备、告警数据。
 *
 * 【数据设计】
 * - 园区名虚构(避免涉及真实公司)
 * - lng/lat 落在真实城市的坐标附近(地图上看起来合理)
 * - 每个园区带 adcode(行政区划编码)用于下钻定位:adcode 前 4 位决定省份归属
 * - 数据口径与 data.js 的园区数据一致(设备数、告警数都用同一个来源风格)
 */

const parks = [
  {
    id: 'p1',
    name: '西安·云麓智慧园',
    province: '陕西省',
    city: '西安市',
    adcode: 610100,
    lng: 108.94,
    lat: 34.34,
    devices: 1280,
    alarms: 12,
    occupancy: 96
  },
  {
    id: 'p2',
    name: '北京·创芯科技园',
    province: '北京市',
    city: '北京市',
    adcode: 110100,
    lng: 116.4,
    lat: 39.9,
    devices: 2350,
    alarms: 31,
    occupancy: 92
  },
  {
    id: 'p3',
    name: '上海·数谷产业园',
    province: '上海市',
    city: '上海市',
    adcode: 310100,
    lng: 121.47,
    lat: 31.23,
    devices: 4100,
    alarms: 45,
    occupancy: 88
  },
  {
    id: 'p4',
    name: '广州·联晟智造园',
    province: '广东省',
    city: '广州市',
    adcode: 440100,
    lng: 113.26,
    lat: 23.13,
    devices: 890,
    alarms: 8,
    occupancy: 94
  },
  {
    id: 'p5',
    name: '深圳·博雅创新园',
    province: '广东省',
    city: '深圳市',
    adcode: 440300,
    lng: 114.06,
    lat: 22.54,
    devices: 3120,
    alarms: 28,
    occupancy: 90
  },
  {
    id: 'p6',
    name: '杭州·星港云谷',
    province: '浙江省',
    city: '杭州市',
    adcode: 330100,
    lng: 120.15,
    lat: 30.28,
    devices: 1750,
    alarms: 19,
    occupancy: 91
  },
  {
    id: 'p7',
    name: '成都·远航智汇园',
    province: '四川省',
    city: '成都市',
    adcode: 510100,
    lng: 104.07,
    lat: 30.57,
    devices: 1560,
    alarms: 22,
    occupancy: 87
  },
  {
    id: 'p8',
    name: '武汉·天枢科技园',
    province: '湖北省',
    city: '武汉市',
    adcode: 420100,
    lng: 114.3,
    lat: 30.59,
    devices: 1430,
    alarms: 15,
    occupancy: 89
  },
  {
    id: 'p9',
    name: '南京·启明产业园',
    province: '江苏省',
    city: '南京市',
    adcode: 320100,
    lng: 118.8,
    lat: 32.06,
    devices: 1280,
    alarms: 11,
    occupancy: 93
  },
  {
    id: 'p10',
    name: '苏州·云启工业园',
    province: '江苏省',
    city: '苏州市',
    adcode: 320500,
    lng: 120.58,
    lat: 31.3,
    devices: 1980,
    alarms: 17,
    occupancy: 95
  },
  {
    id: 'p11',
    name: '长沙·麓谷云园',
    province: '湖南省',
    city: '长沙市',
    adcode: 430100,
    lng: 112.94,
    lat: 28.23,
    devices: 760,
    alarms: 9,
    occupancy: 90
  },
  {
    id: 'p12',
    name: '郑州·中原数谷',
    province: '河南省',
    city: '郑州市',
    adcode: 410100,
    lng: 113.63,
    lat: 34.75,
    devices: 940,
    alarms: 13,
    occupancy: 86
  },
  {
    id: 'p13',
    name: '青岛·海纳智造园',
    province: '山东省',
    city: '青岛市',
    adcode: 370200,
    lng: 120.38,
    lat: 36.07,
    devices: 1120,
    alarms: 10,
    occupancy: 92
  },
  {
    id: 'p14',
    name: '合肥·科创新园',
    province: '安徽省',
    city: '合肥市',
    adcode: 340100,
    lng: 117.23,
    lat: 31.82,
    devices: 1350,
    alarms: 16,
    occupancy: 91
  },
  {
    id: 'p15',
    name: '重庆·两江云园',
    province: '重庆市',
    city: '重庆市',
    adcode: 500100,
    lng: 106.55,
    lat: 29.56,
    devices: 820,
    alarms: 7,
    occupancy: 88
  },
  {
    id: 'p16',
    name: '天津·滨海智汇园',
    province: '天津市',
    city: '天津市',
    adcode: 120100,
    lng: 117.2,
    lat: 39.08,
    devices: 690,
    alarms: 6,
    occupancy: 85
  },
  {
    id: 'p17',
    name: '沈阳·振兴云园',
    province: '辽宁省',
    city: '沈阳市',
    adcode: 210100,
    lng: 123.43,
    lat: 41.8,
    devices: 540,
    alarms: 5,
    occupancy: 83
  },
  {
    id: 'p18',
    name: '昆明·春城智园',
    province: '云南省',
    city: '昆明市',
    adcode: 530100,
    lng: 102.83,
    lat: 24.88,
    devices: 430,
    alarms: 4,
    occupancy: 82
  },
  {
    id: 'p19',
    name: '兰州·金城数园',
    province: '甘肃省',
    city: '兰州市',
    adcode: 620100,
    lng: 103.83,
    lat: 36.06,
    devices: 380,
    alarms: 3,
    occupancy: 80
  },
  {
    id: 'p20',
    name: '乌鲁木齐·丝路云谷',
    province: '新疆维吾尔自治区',
    city: '乌鲁木齐市',
    adcode: 650100,
    lng: 87.62,
    lat: 43.83,
    devices: 350,
    alarms: 2,
    occupancy: 78
  }
]

/** 按规模分档(前端图标分级用同一口径,保持一致性) */
export const PARK_SCALE = { large: 2000, medium: 800 }

/** 全部园区(静态数据,不需要演化 —— 地图页是"态势总览",不是实时监控) */
export const getParks = () => parks.map(p => ({ ...p }))

/** 某省份下的园区数(用于全国视图的省份着色) */
export const getProvinceParkCount = () => {
  const map = {}
  parks.forEach(p => {
    map[p.province] = (map[p.province] || 0) + 1
  })
  return map
}
