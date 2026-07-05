import type { FilterRule, FilterCondition, FilterAction, FilterMetadata } from '@/lib/jmap/sieve-types';
import { debug } from '@/lib/debug';

const HEADER_MAP: Record<string, string> = {
  from: 'From',
  to: 'To',
  cc: 'Cc',
  subject: 'Subject',
};

function escapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Rule names are user-controlled; a raw newline would break out of the
// single-line `# Rule:` comment and inject live Sieve commands.
function stripNewlines(value: string): string {
  return value.replace(/[\r\n]+/g, ' ');
}

// Header field names per RFC 5322: keep only the safe field-name charset so a
// crafted name (e.g. containing a quote) cannot close the quoted Sieve string.
function sanitizeHeaderName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9-]/g, '');
  return cleaned || 'X-Unknown';
}

function generateCondition(condition: FilterCondition): string {
  const { field, comparator, value } = condition;

  if (field === 'size') {
    const op = comparator === 'greater_than' ? ':over' : ':under';
    // Size is user input like every other condition value: keep only a
    // number with an optional K/M/G suffix so it cannot carry Sieve syntax.
    const match = value.trim().match(/^(\d+)\s*([KMG])?/i);
    const size = match ? `${match[1]}${(match[2] || '').toUpperCase()}` : '0';
    return `size ${op} ${size}`;
  }

  if (field === 'body') {
    const matchType = comparator === 'is' ? ':is' : ':contains';
    return `body ${matchType} "${escapeString(value)}"`;
  }

  const headerName = field === 'header'
    ? sanitizeHeaderName(condition.headerName || 'X-Unknown')
    : HEADER_MAP[field];

  const escaped = escapeString(value);

  switch (comparator) {
    case 'contains':
      return `header :contains "${headerName}" "${escaped}"`;
    case 'not_contains':
      return `not header :contains "${headerName}" "${escaped}"`;
    case 'is':
      return `header :is "${headerName}" "${escaped}"`;
    case 'not_is':
      return `not header :is "${headerName}" "${escaped}"`;
    case 'starts_with':
      return `header :matches "${headerName}" "${escaped}*"`;
    case 'ends_with':
      return `header :matches "${headerName}" "*${escaped}"`;
    case 'matches':
      return `header :matches "${headerName}" "${escaped}"`;
    default:
      return `header :contains "${headerName}" "${escaped}"`;
  }
}

function generateActions(actions: FilterAction[]): string[] {
  return actions.map(action => {
    switch (action.type) {
      case 'move':
        return `fileinto "${escapeString(action.value || '')}";`;
      case 'copy':
        return `fileinto :copy "${escapeString(action.value || '')}";`;
      case 'forward':
        return `redirect "${escapeString(action.value || '')}";`;
      case 'mark_read':
        return 'addflag "\\\\Seen";';
      case 'star':
        return 'addflag "\\\\Flagged";';
      case 'add_label':
        return `addflag "$${escapeString(action.value || '')}";`;
      case 'discard':
        return 'discard;';
      case 'reject':
        return `reject "${escapeString(action.value || '')}";`;
      case 'keep':
        return 'keep;';
      case 'stop':
        return 'stop;';
    }
  });
}

function computeRequires(rules: FilterRule[]): string[] {
  const extensions = new Set<string>();
  const enabledRules = rules.filter(r => r.enabled);

  for (const rule of enabledRules) {
    for (const condition of rule.conditions) {
      if (condition.field === 'body') extensions.add('body');
    }
    for (const action of rule.actions) {
      switch (action.type) {
        case 'move':
          extensions.add('fileinto');
          break;
        case 'copy':
          extensions.add('fileinto');
          extensions.add('copy');
          break;
        case 'mark_read':
        case 'star':
        case 'add_label':
          extensions.add('imap4flags');
          break;
        case 'reject':
          extensions.add('reject');
          break;
      }
    }
  }

  return [...extensions].sort();
}

export function generateScript(rules: FilterRule[]): string {
  const metadata: FilterMetadata = { version: 1, rules };
  // Neutralise any `*/` in user fields (e.g. rule names) that would otherwise
  // terminate the metadata block comment early. `\/` is valid JSON and parses
  // back to `/`, so the generate -> parse round-trip is preserved.
  const metadataJson = JSON.stringify(metadata).replace(/\*\//g, '*\\/');
  const lines: string[] = [];

  lines.push('/* @metadata:begin');
  lines.push(metadataJson);
  lines.push('@metadata:end */');
  lines.push('');

  const requires = computeRequires(rules);
  if (requires.length > 0) {
    lines.push(`require [${requires.map(r => `"${r}"`).join(', ')}];`);
  }

  const enabledRules = rules.filter(r => r.enabled);

  for (const rule of enabledRules) {
    if (rule.conditions.length === 0 || rule.actions.length === 0) {
      debug.warn(`Skipping rule "${rule.name}": empty conditions or actions`);
      continue;
    }

    lines.push('');
    lines.push(`# Rule: ${stripNewlines(rule.name)}`);

    const conditions = rule.conditions.map(generateCondition);
    let conditionStr: string;

    if (conditions.length === 0) {
      conditionStr = 'true';
    } else if (conditions.length === 1) {
      conditionStr = conditions[0];
    } else {
      const wrapper = rule.matchType === 'all' ? 'allof' : 'anyof';
      conditionStr = `${wrapper}(${conditions.join(', ')})`;
    }

    const actionLines = generateActions(rule.actions);

    if (rule.stopProcessing) {
      const lastAction = rule.actions[rule.actions.length - 1];
      if (!lastAction || lastAction.type !== 'stop') {
        actionLines.push('stop;');
      }
    }

    lines.push(`if ${conditionStr} {`);
    for (const actionLine of actionLines) {
      lines.push(`    ${actionLine}`);
    }
    lines.push('}');
  }

  lines.push('');
  return lines.join('\n');
}
