#!/usr/bin/env bash
# Read-only Linux host preflight for publication CPU/GPU timing.
# It changes no power setting, process, login session, device, or repository.

set -uo pipefail
shopt -s nullglob

repo=$PWD
expected_commit=''
seconds=${MF_PREFLIGHT_SECONDS:-30}
json_requested=false
allowed_node_processes=${MF_ALLOWED_NODE_PROCESSES:-0}

while (($#)); do
  case "$1" in
    --json) json_requested=true; shift ;;
    --repo) repo=${2:?missing value for --repo}; shift 2 ;;
    --expect) expected_commit=${2:?missing value for --expect}; shift 2 ;;
    --seconds) seconds=${2:?missing value for --seconds}; shift 2 ;;
    --help)
      printf '%s\n' 'Usage: bash benchmarks/linux-preflight.sh [--json] [--repo PATH] [--expect COMMIT] [--seconds N]'
      exit 0
      ;;
    *) printf 'unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done

if [[ ! $seconds =~ ^[0-9]+$ ]] || ((seconds < 1)); then
  printf '%s\n' '--seconds must be a positive integer' >&2
  exit 2
fi
if [[ ! $allowed_node_processes =~ ^[0-9]+$ ]]; then
  printf '%s\n' 'MF_ALLOWED_NODE_PROCESSES must be a non-negative integer' >&2
  exit 2
fi

json_escape() {
  local value=${1-}
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}

bool_json() {
  [[ ${1:-false} == true ]] && printf true || printf false
}

float_ge() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'; }
float_le() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a <= b) }'; }

declare -a reasons=()
add_reason() { reasons+=("$1"); }

kernel_value=$(uname -srm 2>/dev/null || printf unknown)
uptime_seconds=$(cut -d' ' -f1 /proc/uptime 2>/dev/null || printf 0)

source_available=false
source_commit=''
source_branch=''
source_dirty=true
source_status_count=0
source_status_available=false
repo_resolved=$(cd "$repo" 2>/dev/null && pwd -P || true)
git_top_level=''
git_top_level_resolved=''
root_matches_git_top_level=false
if git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_top_level=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null || true)
  git_top_level_resolved=$(cd "$git_top_level" 2>/dev/null && pwd -P || true)
  if [[ -n $repo_resolved && $repo_resolved == "$git_top_level_resolved" ]]; then
    root_matches_git_top_level=true
    source_available=true
    source_commit=$(git -C "$repo" rev-parse HEAD 2>/dev/null || true)
    source_branch=$(git -C "$repo" branch --show-current 2>/dev/null || true)
    if source_status=$(git -C "$repo" status --porcelain=v1 --untracked-files=all 2>/dev/null); then
      source_status_available=true
      if [[ -z $source_status ]]; then source_dirty=false; fi
      if [[ -n $source_status ]]; then source_status_count=$(printf '%s\n' "$source_status" | wc -l); fi
    else
      add_reason 'source status is unavailable'
    fi
    [[ -z $source_commit ]] && add_reason 'source commit is unavailable'
  else
    add_reason 'harness root is not the exact Git worktree top level'
  fi
else
  add_reason 'repository metadata is unavailable'
fi
if [[ $source_dirty == true ]]; then add_reason 'source checkout is dirty'; fi
if [[ -n $expected_commit && $source_commit != "$expected_commit" ]]; then
  add_reason 'source commit does not match the expected commit'
fi

ac_known=false
ac_online=false
for online_path in /sys/class/power_supply/*/online; do
  supply_dir=${online_path%/online}
  supply_type=$(cat "$supply_dir/type" 2>/dev/null || true)
  case "$supply_type" in
    Mains|USB|USB_C|USB_PD)
      ac_known=true
      [[ $(cat "$online_path" 2>/dev/null || printf 0) == 1 ]] && ac_online=true
      ;;
  esac
done
if [[ $ac_known != true ]]; then add_reason 'AC power state is unavailable';
elif [[ $ac_online != true ]]; then add_reason 'host is not on AC power'; fi

power_profile='unavailable'
if command -v powerprofilesctl >/dev/null 2>&1; then
  power_profile=$(powerprofilesctl get 2>/dev/null || printf unavailable)
fi
if [[ $power_profile != performance ]]; then add_reason 'power profile is not performance'; fi

governors='unavailable'
governor_paths=(/sys/devices/system/cpu/cpu*/cpufreq/scaling_governor)
if ((${#governor_paths[@]})); then
  governors=$(for path in "${governor_paths[@]}"; do cat "$path"; done | sort -u | paste -sd, -)
fi

active_local_sessions=0
nonidle_local_sessions=0
if command -v loginctl >/dev/null 2>&1; then
  while read -r session_id _; do
    [[ -z ${session_id:-} ]] && continue
    active=$(loginctl show-session "$session_id" -p Active --value 2>/dev/null || true)
    remote=$(loginctl show-session "$session_id" -p Remote --value 2>/dev/null || true)
    type=$(loginctl show-session "$session_id" -p Type --value 2>/dev/null || true)
    idle=$(loginctl show-session "$session_id" -p IdleHint --value 2>/dev/null || true)
    if [[ $active == yes && $remote != yes && $type =~ ^(wayland|x11|tty)$ ]]; then
      ((active_local_sessions += 1))
      [[ $idle != yes ]] && ((nonidle_local_sessions += 1))
    fi
  done < <(loginctl list-sessions --no-legend 2>/dev/null || true)
else
  add_reason 'login session idle state is unavailable'
fi
if ((nonidle_local_sessions > 0)); then add_reason 'an active local session is not idle'; fi

count_processes() {
  local pattern=$1
  ps -eo comm= 2>/dev/null | awk -v pattern="$pattern" 'BEGIN { IGNORECASE=1 } $0 ~ pattern { count++ } END { print count+0 }'
}

chrome_start=$(count_processes '^(chrome|chromium|chromium-browser|google-chrome)$')
node_start=$(count_processes '^(node|nodejs)$')
codex_start=$(count_processes '^(codex|codex-cli)$')

read_cpu() {
  awk '/^cpu / { print $2, $3, $4, $5, $6, $7, $8, $9; exit }' /proc/stat
}
read_swap() {
  awk '$1 == "pswpin" { in_pages=$2 } $1 == "pswpout" { out_pages=$2 } END { print in_pages+0, out_pages+0 }' /proc/vmstat
}
max_temperature_millic() {
  local maximum=0 value
  for path in /sys/class/hwmon/hwmon*/temp*_input; do
    value=$(cat "$path" 2>/dev/null || printf 0)
    if [[ $value =~ ^[0-9]+$ ]] && ((value > maximum && value < 150000)); then maximum=$value; fi
  done
  printf '%s' "$maximum"
}
kernel_error_count() {
  journalctl -k -b --no-pager 2>/dev/null \
    | grep -Eic 'Xid|NV_ERR|NVRM:.*(error|fail|timeout|out of memory)|amdgpu.*(error|fail|reset|timeout)|oom-killer|Out of memory' \
    || true
}

kernel_log_available=false
if command -v journalctl >/dev/null 2>&1 && journalctl -k -b -n 1 --no-pager >/dev/null 2>&1; then
  kernel_log_available=true
fi
kernel_errors_before=0
if [[ $kernel_log_available == true ]]; then kernel_errors_before=$(kernel_error_count); fi

read -r prev_user prev_nice prev_system prev_idle prev_iowait prev_irq prev_softirq prev_steal < <(read_cpu)
read -r swap_in_before swap_out_before < <(read_swap)
temp_start=$(max_temperature_millic)
temp_max=$temp_start

gpu_paths=(/sys/class/drm/card*/device/gpu_busy_percent)
declare -A gpu_max=()
for path in "${gpu_paths[@]}"; do gpu_max["$path"]=0; done

nvidia_present=false
nvidia_max=0
nvidia_pstate_start='unavailable'
nvidia_pstate_end='unavailable'
if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
  nvidia_present=true
  nvidia_pstate_start=$(nvidia-smi --query-gpu=pstate --format=csv,noheader 2>/dev/null | paste -sd, - || printf unavailable)
fi

idle_sum=0
iowait_sum=0
idle_min=100
iowait_max=0

for ((sample = 0; sample < seconds; sample++)); do
  sleep 1
  read -r user nice system idle iowait irq softirq steal < <(read_cpu)
  delta_user=$((user - prev_user))
  delta_nice=$((nice - prev_nice))
  delta_system=$((system - prev_system))
  delta_idle=$((idle - prev_idle))
  delta_iowait=$((iowait - prev_iowait))
  delta_irq=$((irq - prev_irq))
  delta_softirq=$((softirq - prev_softirq))
  delta_steal=$((steal - prev_steal))
  delta_total=$((delta_user + delta_nice + delta_system + delta_idle + delta_iowait + delta_irq + delta_softirq + delta_steal))
  if ((delta_total > 0)); then
    idle_pct=$(awk -v idle="$delta_idle" -v total="$delta_total" 'BEGIN { printf "%.6f", 100 * idle / total }')
    iowait_pct=$(awk -v wait="$delta_iowait" -v total="$delta_total" 'BEGIN { printf "%.6f", 100 * wait / total }')
    idle_sum=$(awk -v sum="$idle_sum" -v value="$idle_pct" 'BEGIN { printf "%.6f", sum + value }')
    iowait_sum=$(awk -v sum="$iowait_sum" -v value="$iowait_pct" 'BEGIN { printf "%.6f", sum + value }')
    float_le "$idle_pct" "$idle_min" && idle_min=$idle_pct
    float_ge "$iowait_pct" "$iowait_max" && iowait_max=$iowait_pct
  fi
  prev_user=$user; prev_nice=$nice; prev_system=$system; prev_idle=$idle
  prev_iowait=$iowait; prev_irq=$irq; prev_softirq=$softirq; prev_steal=$steal

  for path in "${gpu_paths[@]}"; do
    value=$(cat "$path" 2>/dev/null || printf 0)
    if [[ $value =~ ^[0-9]+$ ]] && ((value > gpu_max["$path"])); then gpu_max["$path"]=$value; fi
  done
  if [[ $nvidia_present == true ]]; then
    while IFS= read -r value; do
      value=${value//[^0-9]/}
      [[ -n $value ]] && ((value > nvidia_max)) && nvidia_max=$value
    done < <(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null || true)
  fi
  temperature=$(max_temperature_millic)
  ((temperature > temp_max)) && temp_max=$temperature
done

avg_idle=$(awk -v sum="$idle_sum" -v count="$seconds" 'BEGIN { printf "%.6f", sum / count }')
avg_iowait=$(awk -v sum="$iowait_sum" -v count="$seconds" 'BEGIN { printf "%.6f", sum / count }')
read -r swap_in_after swap_out_after < <(read_swap)
swap_in_delta=$((swap_in_after - swap_in_before))
swap_out_delta=$((swap_out_after - swap_out_before))
temp_end=$(max_temperature_millic)
temp_delta=$((temp_end - temp_start)); ((temp_delta < 0)) && temp_delta=$((-temp_delta))

if [[ $nvidia_present == true ]]; then
  nvidia_pstate_end=$(nvidia-smi --query-gpu=pstate --format=csv,noheader 2>/dev/null | paste -sd, - || printf unavailable)
fi

chrome_end=$(count_processes '^(chrome|chromium|chromium-browser|google-chrome)$')
node_end=$(count_processes '^(node|nodejs)$')
codex_end=$(count_processes '^(codex|codex-cli)$')
chrome_max=$((chrome_start > chrome_end ? chrome_start : chrome_end))
node_max=$((node_start > node_end ? node_start : node_end))
codex_max=$((codex_start > codex_end ? codex_start : codex_end))

kernel_errors_after=0
if [[ $kernel_log_available == true ]]; then kernel_errors_after=$(kernel_error_count); fi

if ((seconds < 30)); then add_reason 'preflight observation window is shorter than 30 seconds'; fi
if ! float_ge "$avg_idle" 98; then add_reason 'average CPU idle is below 98 percent'; fi
if ! float_le "$iowait_max" 0.1; then add_reason 'CPU I/O wait exceeded 0.1 percent'; fi
if ((swap_in_delta != 0 || swap_out_delta != 0)); then add_reason 'swap activity occurred during preflight'; fi
if ((chrome_max > 0)); then add_reason 'Chrome or Chromium is running'; fi
if ((node_max > allowed_node_processes)); then add_reason 'unrelated Node processes are running'; fi
if ((codex_max > 0)); then add_reason 'Codex processes are running'; fi

gpu_idle=true
gpu_telemetry_available=false
(( ${#gpu_paths[@]} > 0 )) && gpu_telemetry_available=true
[[ $nvidia_present == true ]] && gpu_telemetry_available=true
for path in "${gpu_paths[@]}"; do
  if ((gpu_max["$path"] > 2)); then gpu_idle=false; fi
done
if [[ $gpu_telemetry_available != true ]]; then add_reason 'GPU utilization telemetry is unavailable'; fi
if [[ $nvidia_present == true && $nvidia_max -gt 2 ]]; then gpu_idle=false; fi
if [[ $gpu_idle != true ]]; then add_reason 'GPU utilization exceeded 2 percent'; fi
if [[ $nvidia_present == true && ! $nvidia_pstate_end =~ ^P8(,P8)*$ ]]; then
  add_reason 'NVIDIA GPU did not finish in P8'
fi

if ((temp_max == 0)); then add_reason 'temperature telemetry is unavailable';
else
  ((temp_max > 75000)) && add_reason 'a monitored temperature exceeded 75 C'
  ((temp_delta > 5000)) && add_reason 'temperature changed by more than 5 C'
fi
if [[ $kernel_log_available != true ]]; then add_reason 'kernel GPU error log is unavailable';
else
  ((kernel_errors_before != 0)) && add_reason 'kernel or GPU errors already exist in this boot'
  ((kernel_errors_after != kernel_errors_before)) && add_reason 'new kernel or GPU errors appeared during preflight'
fi

publication_eligible=false
((${#reasons[@]} == 0)) && publication_eligible=true

# JSON is the stable output even when --json is omitted; the flag exists to
# make automation intent explicit and leave room for a future human format.
: "$json_requested"
printf '{'
printf '"schemaVersion":1,'
printf '"kind":"matter-field-linux-preflight",'
printf '"capturedAt":"%s",' "$(date --iso-8601=seconds 2>/dev/null || date -Iseconds)"
printf '"publicationEligible":'; bool_json "$publication_eligible"; printf ','
printf '"criteria":{"seconds":30,"minimumCpuIdlePercent":98,"maximumIoWaitPercent":0.1,"maximumGpuBusyPercent":2,"maximumTemperatureMilliC":75000,"maximumTemperatureDeltaMilliC":5000},'
printf '"system":{"kernel":"%s","uptimeSeconds":%s,"observationSeconds":%s},' \
  "$(json_escape "$kernel_value")" "$uptime_seconds" "$seconds"
printf '"source":{"rootMatchesGitTopLevel":'; bool_json "$root_matches_git_top_level"
printf ',"available":'; bool_json "$source_available"; printf ',"statusAvailable":'; bool_json "$source_status_available"
printf ',"commit":"%s","branch":"%s","dirty":' "$(json_escape "$source_commit")" "$(json_escape "$source_branch")"; bool_json "$source_dirty"
printf ',"statusEntryCount":%s},' "$source_status_count"
printf '"power":{"acKnown":'; bool_json "$ac_known"; printf ',"acOnline":'; bool_json "$ac_online"
printf ',"profile":"%s","governors":"%s"},' "$(json_escape "$power_profile")" "$(json_escape "$governors")"
printf '"sessions":{"activeLocal":%s,"nonIdleLocal":%s},' "$active_local_sessions" "$nonidle_local_sessions"
printf '"processes":{"chromeMax":%s,"nodeMax":%s,"allowedNode":%s,"codexMax":%s},' "$chrome_max" "$node_max" "$allowed_node_processes" "$codex_max"
printf '"cpu":{"averageIdlePercent":%s,"minimumIdlePercent":%s,"averageIoWaitPercent":%s,"maximumIoWaitPercent":%s},' "$avg_idle" "$idle_min" "$avg_iowait" "$iowait_max"
printf '"swap":{"pagesInDelta":%s,"pagesOutDelta":%s},' "$swap_in_delta" "$swap_out_delta"
printf '"gpu":{"telemetryAvailable":'; bool_json "$gpu_telemetry_available"; printf ',"idle":'; bool_json "$gpu_idle"; printf ',"sysfsBusy":['
first=true
for path in "${gpu_paths[@]}"; do
  [[ $first == true ]] || printf ','; first=false
  printf '{"path":"%s","maximumPercent":%s}' "$(json_escape "$path")" "${gpu_max[$path]}"
done
printf '],"nvidia":{"present":'; bool_json "$nvidia_present"
printf ',"maximumPercent":%s,"pstateStart":"%s","pstateEnd":"%s"}},' "$nvidia_max" "$(json_escape "$nvidia_pstate_start")" "$(json_escape "$nvidia_pstate_end")"
printf '"temperature":{"startMilliC":%s,"endMilliC":%s,"maximumMilliC":%s,"absoluteDeltaMilliC":%s},' "$temp_start" "$temp_end" "$temp_max" "$temp_delta"
printf '"kernelErrors":{"available":'; bool_json "$kernel_log_available"
printf ',"before":%s,"after":%s},' "$kernel_errors_before" "$kernel_errors_after"
printf '"reasons":['
for ((index = 0; index < ${#reasons[@]}; index++)); do
  ((index > 0)) && printf ','
  printf '"%s"' "$(json_escape "${reasons[index]}")"
done
printf ']}\n'
