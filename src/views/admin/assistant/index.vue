<template>
  <div class="pm-page chat-page">
    <div class="pm-card chat-card">
      <header class="chat-head">
        <div class="head-left">
          <el-icon class="head-icon"><MagicStick /></el-icon>
          <div>
            <h3>智能运维助手</h3>
            <p class="sub">用自然语言查询园区实时数据 · 流式输出(SSE)</p>
          </div>
        </div>
        <div class="head-right">
          <el-tag v-if="firstTokenMs !== null" type="success" effect="plain" size="small">
            首字 {{ firstTokenMs }} ms
          </el-tag>
          <el-tag v-if="ready === false" type="warning" effect="plain" size="small">未配置 API Key</el-tag>
          <el-button :icon="Delete" size="small" :disabled="streaming || !messages.length" @click="onReset">
            清空
          </el-button>
        </div>
      </header>

      <div ref="scrollEl" class="chat-body">
        <!-- 空态:给几个能直接演示的问题,便于快速试用 -->
        <div v-if="!messages.length" class="chat-empty">
          <p class="empty-title">试试这样问:</p>
          <div class="suggestions">
            <button v-for="q in suggestions" :key="q" class="suggestion" type="button" @click="send(q)">
              {{ q }}
            </button>
          </div>
        </div>

        <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
          <div class="bubble">
            <span class="text">{{ m.content }}</span>
            <!-- 流式光标:只在"正在输出且还没有内容/还在长"时贴着文字尾部闪 -->
            <span v-if="m.role === 'assistant' && streaming && i === messages.length - 1" class="caret" />
            <div v-if="m.error" class="msg-error">⚠ {{ m.error }}</div>
          </div>
        </div>
      </div>

      <footer class="chat-foot">
        <el-input
          v-model="draft"
          type="textarea"
          :rows="2"
          resize="none"
          placeholder="问点什么,比如:哪栋楼能耗最高?(Enter 发送,Shift+Enter 换行)"
          :disabled="streaming"
          @keydown.enter.exact.prevent="onSend"
        />
        <el-button v-if="streaming" type="danger" :icon="VideoPause" @click="stop">停止</el-button>
        <el-button v-else type="primary" :icon="Promotion" :disabled="!draft.trim()" @click="onSend">发送</el-button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { Delete, MagicStick, Promotion, VideoPause } from '@element-plus/icons-vue'
import { apiAiStatus } from '@/api'
import { useChatStream } from '@/composables/useChatStream'

/**
 * 智能运维助手页
 *
 * 【这个页面的关键点】
 * 界面本身很朴素,重点全在那条链路上:
 *   输入 → fetch POST(带 signal)→ 服务端注入园区真实数据后转发大模型
 *   → SSE 逐帧回传 → ReadableStream 增量读取 → 按 \n\n 分帧 → 逐字上屏
 * 关键取舍见 composables/useChatStream.ts 的注释(为什么不用 axios/EventSource、
 * 粘包怎么切、AbortSignal 怎么两头联动)。
 */

const { messages, streaming, firstTokenMs, send, stop, reset } = useChatStream()

const draft = ref('')
const scrollEl = ref<HTMLElement>()
/** null = 还没问出来;false = 后端明确回复没配 key */
const ready = ref<boolean | null>(null)

const suggestions = [
  '园区现在哪栋楼功率最高?',
  '哪些楼宇告警最多?帮我排个序',
  '未处理告警有多少条?紧急的有几条?',
  '整体设备运行情况怎么样?'
]

onMounted(async () => {
  try {
    ready.value = (await apiAiStatus()).configured
  } catch {
    ready.value = null // 探针失败不影响对话本身
  }
})

const lastContentLength = computed(() => {
  const last = messages.value[messages.value.length - 1]
  return last ? last.content.length : 0
})

/**
 * 只在「最后一条消息变长」时贴底滚动。
 * 用 computed 盯长度而不是 deep watch 整个数组:流式输出时每来一个 delta
 * 都会改数组,deep watch 会触发全量比对,白白浪费;长度变化才是真正要跟的。
 */
watch(lastContentLength, () =>
  nextTick(() => {
    const el = scrollEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
)

/** 消息条数变化(新问题/新回复入列)也要贴底 —— 此时最后一条长度可能还是 0 */
watch(
  () => messages.value.length,
  () =>
    nextTick(() => {
      const el = scrollEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
)

function onSend() {
  const text = draft.value
  draft.value = ''
  void send(text)
}

function onReset() {
  reset()
  draft.value = ''
}
</script>

<style scoped>
/* 卡片撑满可视区高度:页面上 16px × 2 的 padding + 后台顶栏约 100px */
.chat-card {
  height: calc(100vh - 148px);
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}

.chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--pm-border);
}
.head-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.head-icon {
  font-size: 22px;
  color: var(--pm-primary);
}
.chat-head h3 {
  margin: 0;
  font-size: 15px;
  color: var(--pm-text-1);
}
.chat-head .sub {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--pm-text-3);
}
.head-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-body {
  flex: 1;
  min-height: 0; /* 没有它 flex 子项不会收缩,滚动条出不来 */
  overflow-y: auto;
  padding: 16px;
}

/* ---- 空态与推荐问题 ---- */
.chat-empty {
  padding: 24px 8px;
}
.empty-title {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--pm-text-3);
}
.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.suggestion {
  padding: 7px 14px;
  border: 1px solid var(--pm-border);
  border-radius: 16px;
  background: var(--pm-bg-card);
  color: var(--pm-text-2);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}
.suggestion:hover {
  border-color: var(--pm-primary);
  color: var(--pm-primary);
  background: var(--pm-primary-bg);
}

/* ---- 气泡 ---- */
.msg {
  display: flex;
  margin-bottom: 14px;
}
.msg.user {
  justify-content: flex-end;
}
.bubble {
  max-width: 76%;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.75;
  background: var(--pm-bg-page);
  color: var(--pm-text-1);
}
.msg.user .bubble {
  background: var(--pm-primary);
  color: #fff;
}
/* 助手回答要保留换行与缩进 —— 默认 white-space 会把模型的排版全吃掉 */
.text {
  white-space: pre-wrap;
  word-break: break-word;
}

/* 流式光标:贴在最后一个字后面闪,让"正在生成"这件事看得见 */
.caret {
  display: inline-block;
  width: 2px;
  height: 14px;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--pm-primary);
  animation: blink 1s steps(2, start) infinite;
}
@keyframes blink {
  to {
    visibility: hidden;
  }
}

.msg-error {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--pm-danger);
  color: var(--pm-danger);
  font-size: 12px;
}

/* ---- 输入区 ---- */
.chat-foot {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid var(--pm-border);
}
.chat-foot :deep(.el-textarea) {
  flex: 1;
}
</style>
