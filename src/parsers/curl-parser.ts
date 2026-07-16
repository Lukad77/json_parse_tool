import { ParsedCurl } from './types';
import { formatJson, isJson } from './json-formatter';

/**
 * 预处理 curl 命令文本
 * - 去除行尾的反斜杠换行符 (\\\n) 合并为单行
 * - 去除多余空白
 */
function preprocessCurl(command: string): string {
  // 去除反斜杠+换行（可能带有前后空白）
  let result = command.replace(/\\\s*\n\s*/g, ' ');
  // 去除多余空白
  result = result.replace(/\s+/g, ' ').trim();
  return result;
}

/**
 * 将命令行字符串拆分为 token 数组
 * 规则：
 * - 空格分隔 token
 * - 单引号内的内容作为整体（包括空格）
 * - 双引号内的内容作为整体，支持反斜杠转义
 * - 引号不包含在结果中
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // 跳过空白
    while (i < len && input[i] === ' ') {
      i++;
    }
    if (i >= len) break;

    const ch = input[i];

    if (ch === "'") {
      // 单引号：找到配对的单引号，内容原样保留
      i++;
      let token = '';
      while (i < len && input[i] !== "'") {
        token += input[i];
        i++;
      }
      if (i < len) i++; // 跳过闭合引号
      tokens.push(token);
    } else if (ch === '"') {
      // 双引号：支持反斜杠转义
      i++;
      let token = '';
      while (i < len && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < len) {
          const next = input[i + 1];
          if (next === '"' || next === '\\' || next === 'n' || next === 't') {
            if (next === 'n') {
              token += '\n';
            } else if (next === 't') {
              token += '\t';
            } else {
              token += next;
            }
            i += 2;
          } else {
            token += input[i];
            i++;
          }
        } else {
          token += input[i];
          i++;
        }
      }
      if (i < len) i++; // 跳过闭合引号
      tokens.push(token);
    } else {
      // 普通 token：读取到空格为止
      let token = '';
      while (i < len && input[i] !== ' ') {
        token += input[i];
        i++;
      }
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * 判断一个 token 是否是 URL
 */
function isUrl(token: string): boolean {
  return /^https?:\/\//i.test(token);
}

/**
 * 解析 curl 命令为结构化对象
 */
export function parseCurl(command: string): ParsedCurl {
  const processed = preprocessCurl(command);

  // 去掉开头的 "curl "
  let cmdBody = processed;
  if (/^curl\s/i.test(cmdBody)) {
    cmdBody = cmdBody.replace(/^curl\s+/i, '');
  }

  const tokens = tokenize(cmdBody);

  let method = '';
  let url = '';
  const headers: Record<string, string> = {};
  let body: string | undefined;
  let cookies: string | undefined;
  let auth: string | undefined;
  const options: string[] = [];

  // 需要取下一个 token 作为值的选项
  const optionsWithValue = new Set([
    '-X', '--request',
    '-H', '--header',
    '-d', '--data', '--data-raw', '--data-binary',
    '-b', '--cookie',
    '-u', '--user',
    '-o', '--output',
  ]);

  // 布尔选项（无需取值）
  const booleanOptions = new Set([
    '-k', '--insecure',
    '-v', '--verbose',
    '-s', '--silent',
    '-L', '--location',
    '--compressed',
  ]);

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      method = tokens[++i] || '';
    } else if (token === '-H' || token === '--header') {
      const headerStr = tokens[++i] || '';
      const colonIdx = headerStr.indexOf(':');
      if (colonIdx !== -1) {
        const key = headerStr.substring(0, colonIdx).trim();
        const value = headerStr.substring(colonIdx + 1).trim();
        headers[key] = value;
      }
    } else if (
      token === '-d' ||
      token === '--data' ||
      token === '--data-raw' ||
      token === '--data-binary'
    ) {
      body = tokens[++i] || '';
    } else if (token === '-b' || token === '--cookie') {
      cookies = tokens[++i] || '';
    } else if (token === '-u' || token === '--user') {
      auth = tokens[++i] || '';
    } else if (token === '-o' || token === '--output') {
      options.push(`${token} ${tokens[++i] || ''}`);
    } else if (booleanOptions.has(token)) {
      options.push(token);
    } else if (token.startsWith('-') && !optionsWithValue.has(token) && !booleanOptions.has(token)) {
      // 未知选项：如果下一个 token 不是以 - 开头且不是 URL，视为值
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-') && !isUrl(tokens[i + 1])) {
        options.push(`${token} ${tokens[++i]}`);
      } else {
        options.push(token);
      }
    } else if (isUrl(token)) {
      url = token;
    } else if (!url && !token.startsWith('-')) {
      // 可能是 URL（没有 http:// 前缀的情况）或其他参数
      url = token;
    }

    i++;
  }

  // 推断 method
  if (!method) {
    method = body ? 'POST' : 'GET';
  } else {
    method = method.toUpperCase();
  }

  return {
    method,
    url,
    headers,
    body,
    cookies,
    auth,
    options,
  };
}

/**
 * 将解析结果格式化为可执行的 curl 命令（带缩进和续行符）
 */
export function formatCurl(parsed: ParsedCurl): string {
  const parts: string[] = [];

  // 第一行：curl + method
  if (parsed.method && parsed.method !== 'GET') {
    parts.push(`curl -X ${parsed.method}`);
  } else {
    parts.push('curl');
  }

  // URL
  parts.push(`  '${parsed.url}'`);

  // Headers
  const headerKeys = Object.keys(parsed.headers);
  for (const key of headerKeys) {
    parts.push(`  -H '${key}: ${parsed.headers[key]}'`);
  }

  // Cookies
  if (parsed.cookies) {
    parts.push(`  -b '${parsed.cookies}'`);
  }

  // Auth
  if (parsed.auth) {
    parts.push(`  -u '${parsed.auth}'`);
  }

  // Options (如 -i, -k, --compressed 等)
  if (parsed.options.length > 0) {
    for (const opt of parsed.options) {
      parts.push(`  ${opt}`);
    }
  }

  // Body/Data
  if (parsed.body) {
    if (isJson(parsed.body)) {
      const prettyBody = formatJson(parsed.body);
      parts.push(`  -d '${prettyBody}'`);
    } else {
      parts.push(`  -d '${parsed.body}'`);
    }
  }

  // 每行末尾加 \ 续行符（最后一行除外）
  return parts.map((line, i) => {
    if (i < parts.length - 1) {
      return line + ' \\';
    }
    return line;
  }).join('\n');
}

/**
 * 一步到位：解析并格式化
 */
export function parseCurlAndFormat(command: string): string {
  const parsed = parseCurl(command);
  return formatCurl(parsed);
}
