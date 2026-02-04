import { OPERATORS, OperatorName, OperatorTerm, PropertyTerm, QueryNode, TextTerm } from "./queryTypes";

interface ParseOptions {
	allowOperators?: boolean;
}

export interface ParseResult {
	root: QueryNode;
	errors: string[];
}

export function parseQuery(input: string, options: ParseOptions = {}): ParseResult {
	const parser = new QueryParser(input, options);
	return parser.parse();
}

class QueryParser {
	private input: string;
	private pos = 0;
	private errors: string[] = [];
	private allowOperators: boolean;

	constructor(input: string, options: ParseOptions) {
		this.input = input;
		this.allowOperators = options.allowOperators ?? true;
	}

	parse(): ParseResult {
		this.skipWhitespace();
		const root = this.parseExpression();
		this.skipWhitespace();
		if (!this.isEnd()) {
			this.errors.push(`Unexpected token at position ${this.pos + 1}`);
		}
		return { root: root ?? { type: "and", terms: [] }, errors: this.errors };
	}

	private parseExpression(): QueryNode | null {
		let left = this.parseAnd();
		if (!left) return null;
		while (true) {
			this.skipWhitespace();
			if (!this.matchKeyword("OR")) break;
			const right = this.parseAnd();
			if (!right) {
				this.errors.push(`Expected term after OR at position ${this.pos + 1}`);
				break;
			}
			if (left.type === "or") {
				left.terms.push(right);
			} else {
				left = { type: "or", terms: [left, right] };
			}
		}
		return left;
	}

	private parseAnd(): QueryNode | null {
		const terms: QueryNode[] = [];
		while (true) {
			this.skipWhitespace();
			if (this.isEnd() || this.peek() === ")" || this.peek() === "]") break;
			const term = this.parseUnary();
			if (!term) break;
			terms.push(term);
		}

		if (terms.length === 0) return null;
		if (terms.length === 1) return terms[0]!;
		return { type: "and", terms };
	}

	private parseUnary(): QueryNode | null {
		this.skipWhitespace();
		if (this.peek() === "-") {
			this.consume();
			const term = this.parseUnary();
			if (!term) {
				this.errors.push(`Expected term after '-' at position ${this.pos + 1}`);
				return null;
			}
			return { type: "not", term };
		}
		return this.parsePrimary();
	}

	private parsePrimary(): QueryNode | null {
		this.skipWhitespace();
		const ch = this.peek();
		if (!ch) return null;

		if (ch === "(") {
			this.consume();
			const expr = this.parseExpression();
			this.skipWhitespace();
			if (this.peek() !== ")") {
				this.errors.push(`Missing ')' at position ${this.pos + 1}`);
			} else {
				this.consume();
			}
			return expr;
		}

		if (ch === '"') {
			const phrase = this.readQuoted();
			if (phrase === null) return null;
			return { type: "term", term: this.makeTextTerm(phrase, true, false, null) };
		}

		if (ch === "/") {
			const regex = this.readRegex();
			if (!regex) return null;
			return { type: "term", term: this.makeTextTerm(regex.pattern, false, true, regex.flags) };
		}

		if (ch === "[") {
			const property = this.readBracket();
			if (property === null) return null;
			return { type: "term", term: property };
		}

		return this.parseWordOrOperator();
	}

	private parseWordOrOperator(): QueryNode | null {
		this.skipWhitespace();
		const start = this.pos;
		const word = this.readWord();
		if (!word) return null;

		if (this.allowOperators) {
			const operatorMatch = this.matchOperator(word, start);
			if (operatorMatch) {
				return { type: "term", term: operatorMatch };
			}
		}

		return { type: "term", term: this.makeTextTerm(word, false, false, null) };
	}

	private matchOperator(word: string, start: number): OperatorTerm | null {
		const operator = this.extractOperator(word);
		if (!operator) return null;

		const inlineOperand = word.slice(operator.length + 1);
		if (inlineOperand) {
			const operand = this.parseInlineOperand(inlineOperand);
			if (!operand) return null;
			const term: OperatorTerm = { kind: "operator", operator, operand };
			return term;
		}

		this.skipWhitespace();
		const operand = this.parsePrimary();
		if (!operand) {
			this.errors.push(`Expected operand for ${operator}: at position ${this.pos + 1}`);
			return null;
		}
		const term: OperatorTerm = { kind: "operator", operator, operand };
		return term;
	}

	private parseInlineOperand(operandText: string): QueryNode | null {
		const parser = new QueryParser(operandText, { allowOperators: this.allowOperators });
		const result = parser.parse();
		if (result.errors.length > 0) {
			this.errors.push(...result.errors);
			return null;
		}
		return result.root;
	}

	private extractOperator(word: string): OperatorName | null {
		const lower = word.toLowerCase();
		for (const op of OPERATORS) {
			if (lower === `${op}:` || lower.startsWith(`${op}:`)) {
				return op;
			}
		}
		return null;
	}

	private readWord(): string | null {
		const start = this.pos;
		while (!this.isEnd()) {
			const ch = this.peek();
			if (!ch || /\s/.test(ch) || ch === "(" || ch === ")" || ch === "]") break;
			this.consume();
		}
		if (this.pos === start) return null;
		return this.input.slice(start, this.pos);
	}

	private readQuoted(): string | null {
		if (this.peek() !== '"') return null;
		this.consume();
		let result = "";
		let escaped = false;
		while (!this.isEnd()) {
			const ch = this.consume();
			if (!ch) break;
			if (escaped) {
				result += ch;
				escaped = false;
				continue;
			}
			if (ch === "\\") {
				escaped = true;
				continue;
			}
			if (ch === '"') {
				return result;
			}
			result += ch;
		}
		this.errors.push(`Unterminated quote at position ${this.pos + 1}`);
		return null;
	}

	private readRegex(): { pattern: string; flags: string | null } | null {
		if (this.peek() !== "/") return null;
		this.consume();
		let pattern = "";
		let escaped = false;
		while (!this.isEnd()) {
			const ch = this.consume();
			if (!ch) break;
			if (escaped) {
				pattern += ch;
				escaped = false;
				continue;
			}
			if (ch === "\\") {
				escaped = true;
				pattern += ch;
				continue;
			}
			if (ch === "/") {
				const flags = this.readRegexFlags();
				return { pattern, flags };
			}
			pattern += ch;
		}
		this.errors.push(`Unterminated regex at position ${this.pos + 1}`);
		return null;
	}

	private readRegexFlags(): string | null {
		let flags = "";
		while (!this.isEnd()) {
			const ch = this.peek();
			if (!ch || /\s/.test(ch)) break;
			if (!/[gimsuy]/.test(ch)) break;
			flags += ch;
			this.consume();
		}
		return flags || null;
	}

	private readBracket(): PropertyTerm | null {
		if (this.peek() !== "[") return null;
		this.consume();
		let content = "";
		let escaped = false;
		let inQuote = false;
		let inRegex = false;
		while (!this.isEnd()) {
			const ch = this.consume();
			if (!ch) break;
			if (escaped) {
				content += ch;
				escaped = false;
				continue;
			}
			if (ch === "\\") {
				escaped = true;
				content += ch;
				continue;
			}
			if (ch === '"' && !inRegex) {
				inQuote = !inQuote;
				content += ch;
				continue;
			}
			if (ch === "/" && !inQuote) {
				inRegex = !inRegex;
				content += ch;
				continue;
			}
			if (ch === "]" && !inQuote && !inRegex) {
				return this.parsePropertyContent(content.trim());
			}
			content += ch;
		}
		this.errors.push(`Unterminated property filter at position ${this.pos + 1}`);
		return null;
	}

	private parsePropertyContent(content: string): PropertyTerm {
		const { namePart, valuePart } = splitProperty(content);
		let nameQuery: QueryNode | null = null;
		if (namePart) {
			const nameResult = parseQuery(namePart, { allowOperators: false });
			if (nameResult.errors.length > 0) {
				this.errors.push(...nameResult.errors);
			}
			nameQuery = nameResult.root;
		}

		if (!valuePart) {
			return {
				kind: "property",
				nameQuery,
				valueQuery: null,
				comparator: null,
				nullCheck: false,
			};
		}

		const valueTrimmed = valuePart.trim();
		const lower = valueTrimmed.toLowerCase();
		if (lower === "null") {
			return {
				kind: "property",
				nameQuery,
				valueQuery: null,
				comparator: null,
				nullCheck: true,
			};
		}

		let comparator: "lt" | "gt" | null = null;
		let valueForQuery = valueTrimmed;
		if (valueTrimmed.startsWith("<")) {
			comparator = "lt";
			valueForQuery = valueTrimmed.slice(1).trim();
		} else if (valueTrimmed.startsWith(">")) {
			comparator = "gt";
			valueForQuery = valueTrimmed.slice(1).trim();
		}

		let valueQuery: QueryNode | null = null;
		if (valueForQuery) {
			const valueResult = parseQuery(valueForQuery, { allowOperators: false });
			if (valueResult.errors.length > 0) {
				this.errors.push(...valueResult.errors);
			}
			valueQuery = valueResult.root;
		}

		return {
			kind: "property",
			nameQuery,
			valueQuery,
			comparator,
			nullCheck: false,
		};
	}

	private makeTextTerm(value: string, isPhrase: boolean, isRegex: boolean, regexFlags: string | null): TextTerm {
		return {
			kind: "text",
			value,
			isPhrase,
			isRegex,
			regexFlags,
		};
	}

	private matchKeyword(keyword: string): boolean {
		const start = this.pos;
		this.skipWhitespace();
		if (this.input.slice(this.pos, this.pos + keyword.length).toUpperCase() !== keyword) {
			this.pos = start;
			return false;
		}
		const after = this.input[this.pos + keyword.length];
		if (after && /[^\s)]/.test(after)) {
			this.pos = start;
			return false;
		}
		this.pos += keyword.length;
		return true;
	}

	private skipWhitespace() {
		while (!this.isEnd() && /\s/.test(this.peek()!)) {
			this.consume();
		}
	}

	private peek(): string | null {
		if (this.pos >= this.input.length) return null;
		return this.input[this.pos] ?? null;
	}

	private consume(): string | null {
		if (this.pos >= this.input.length) return null;
		const ch = this.input[this.pos] ?? null;
		this.pos++;
		return ch;
	}

	private isEnd() {
		return this.pos >= this.input.length;
	}
}

function splitProperty(content: string): { namePart: string; valuePart: string | null } {
	let inQuote = false;
	let inRegex = false;
	let escaped = false;
	for (let i = 0; i < content.length; i++) {
		const ch = content[i] ?? "";
		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (ch === '"' && !inRegex) {
			inQuote = !inQuote;
			continue;
		}
		if (ch === "/" && !inQuote) {
			inRegex = !inRegex;
			continue;
		}
		if (ch === ":" && !inQuote && !inRegex) {
			return {
				namePart: content.slice(0, i).trim(),
				valuePart: content.slice(i + 1).trim(),
			};
		}
	}
	return { namePart: content.trim(), valuePart: null };
}
