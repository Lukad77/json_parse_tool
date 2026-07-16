// 输入类型
export type InputType = 'log' | 'curl' | 'json' | 'batch' | 'unknown';

// 解析后的日志行
export interface ParsedLogLine {
  timestamp?: string;
  level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'FATAL' | 'TRACE';
  source?: string;      // 文件路径+函数名+行号
  message: string;
  jsonBodies?: string[]; // 从 message 中提取的 JSON 字符串
}

// curl 解析结果
export interface ParsedCurl {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  cookies?: string;
  auth?: string;
  options: string[];     // 其他未识别的选项
}

// 合并后的日志条目
export interface MergedLogEntry {
  header: string;        // 主日志行
  stackLines: string[];  // 堆栈/续行
  isStack: boolean;
}

// 解析结果
export interface ParseResult {
  type: InputType;
  formatted: string;     // 格式化后的完整文本
}
