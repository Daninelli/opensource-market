/**
 * 自动追踪项目变动，写入 data/changes.json，供详情页「变动记录」展示。
 *
 * 为什么需要单独一个脚本：
 *   置顶、推荐这类是我们自己改 projects.json 的字段，GitHub API 抓不到。
 *   所以这里存一份「上次的状态快照」，每次跟当前 projects.json 比对，
 *   差异就是一次变更事件。全部自动，不需要人工记账。
 *
 * 追踪的变化：
 *   license      许可协议变更（开→限制 / 限制→开 / 开→开）
 *   pinned       置顶
 *   unpinned     取消置顶
 *   pin_label    推荐位调整（比如「置顶」改成「推荐」）
 *   archived     仓库已归档
 *   unarchived   仓库恢复维护
 *
 * 用法：node tools/track-changes.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectsPath = join(root, "projects.json");
const changesPath = join(root, "data", "changes.json");

const KEEP_DAYS = 3 * 365;

/** GitHub 的 NOASSERTION / 空值不可信，不能当成「协议变了」 */
const UNRELIABLE = new Set(["", "noassertion", "other", "none", "unknown"]);
function reliableLicense(value) {
    return Boolean(value) && !UNRELIABLE.has(String(value).trim().toLowerCase());
}

const projects = JSON.parse(await readFile(projectsPath, "utf8"));

let log = { state: {}, events: [] };
try {
    log = JSON.parse(await readFile(changesPath, "utf8"));
} catch {
    /* 首次运行 */
}
if (!log.state || typeof log.state !== "object") log.state = {};
if (!Array.isArray(log.events)) log.events = [];

const today = new Date().toISOString().slice(0, 10);
const isFirstRun = Object.keys(log.state).length === 0;
const newEvents = [];

// 记下改动前的快照，用来判断「这次到底有没有变化」
const stateBefore = JSON.stringify(log.state);
const eventsBefore = log.events.length;

function push(repo, type, extra) {
    newEvents.push({ date: today, repo, type, ...extra });
}

for (const project of projects) {
    const repo = project.repo;
    if (!repo) continue;

    const current = {
        license: project.license || null,
        pinned: project.pinned === true,
        pin_label: project.pin_label || null,
        archived: project.archived === true
    };
    const previous = log.state[repo];

    // 首次运行只建立基线，不生成事件（否则会凭空冒出上百条「变更」）
    if (previous) {
        // 协议变更：两端都得是可信值才算
        if (
            reliableLicense(current.license) &&
            reliableLicense(previous.license) &&
            String(previous.license).trim() !== String(current.license).trim()
        ) {
            push(repo, "license", { from: String(previous.license).trim(), to: current.license });
        }

        // 置顶状态
        if (previous.pinned !== current.pinned) {
            push(repo, current.pinned ? "pinned" : "unpinned");
        } else if (previous.pin_label !== current.pin_label && current.pinned) {
            // 同一个置顶位换了标签（置顶 ↔ 推荐）
            push(repo, "pin_label", { from: previous.pin_label, to: current.pin_label });
        }

        // 归档状态
        if (previous.archived !== current.archived) {
            push(repo, current.archived ? "archived" : "unarchived");
        }
    }

    log.state[repo] = current;
}

// 清理已经被移出项目的仓库，避免快照无限膨胀
const liveRepos = new Set(projects.map((p) => p.repo));
for (const repo of Object.keys(log.state)) {
    if (!liveRepos.has(repo)) delete log.state[repo];
}

// 同一天同一项目同一类型只留一条（同一天重复跑不会重复记）
const seen = new Set(log.events.map((e) => `${e.date}|${e.repo}|${e.type}`));
let added = 0;
for (const event of newEvents) {
    const key = `${event.date}|${event.repo}|${event.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    log.events.push(event);
    added += 1;
}

// 按日期倒序 + 只保留最近 3 年
const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
log.events = log.events
    .filter((e) => e.date >= cutoff)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

/**
 * 没变化就完全不碰文件。
 * 之前这里每次都重写并把 updated_at 设成当前时间，结果每天必然产生一次提交，
 * 把「只记录真实变动」的初衷完全抵消了。
 */
const stateChanged = JSON.stringify(log.state) !== stateBefore;
const eventsChanged = log.events.length !== eventsBefore;
const dirty = isFirstRun || stateChanged || eventsChanged;

if (!dirty) {
    console.log("没有检测到变动（文件保持不变）");
    process.exit(0);
}

const previous = await readFile(changesPath, "utf8").catch(() => "");
const next = JSON.stringify(
    {
        note: "由 tools/track-changes.mjs 自动维护；只追加变动记录，不重新计算历史",
        updated_at: new Date().toISOString(),
        events: log.events,
        state: log.state
    },
    null,
    2
) + "\n";

// 内容一样就不写，连时间戳都不动，保证 git 里看不到变化
if (next !== previous) {
    await writeFile(changesPath, next, "utf8");
}

if (isFirstRun) {
    console.log(`已建立变动基线：${Object.keys(log.state).length} 个项目`);
    console.log("（首次运行不生成事件，之后每天比对差异）");
} else if (added) {
    console.log(`检测到 ${added} 条新变动：`);
    for (const event of newEvents) {
        const detail =
            event.type === "license"
                ? ` ${event.from} → ${event.to}`
                : event.from !== undefined
                  ? ` ${event.from} → ${event.to}`
                  : "";
        console.log(`  ${event.date}  ${event.repo}  ${event.type}${detail}`);
    }
} else {
    console.log("没有检测到变动");
}
console.log(`累计事件：${log.events.length} 条`);