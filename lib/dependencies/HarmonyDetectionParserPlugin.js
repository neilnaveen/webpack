/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/

"use strict";

const WebpackError = require("../WebpackError");
const DynamicExports = require("./DynamicExports");
const HarmonyCompatibilityDependency = require("./HarmonyCompatibilityDependency");
const HarmonyExports = require("./HarmonyExports");

/** @typedef {import("../../declarations/WebpackOptions").JavascriptParserOptions} JavascriptParserOptions */
/** @typedef {import("../RuntimeTemplate")} RuntimeTemplate */

module.exports = class HarmonyDetectionParserPlugin {
	/**
	 * @param {JavascriptParserOptions} options options
	 * @param {RuntimeTemplate} runtimeTemplate runtime template
	 */
	constructor(options, runtimeTemplate) {
		const { topLevelAwait = false } = options || {};
		this.topLevelAwait = topLevelAwait;
		this.runtimeTemplate = runtimeTemplate;
	}

	apply(parser) {
		const runtimeTemplate = this.runtimeTemplate;
		parser.hooks.program.tap("HarmonyDetectionParserPlugin", ast => {
			const isStrictHarmony = parser.state.module.type === "javascript/esm";
			const isHarmony =
				isStrictHarmony ||
				ast.body.some(
					statement =>
						statement.type === "ImportDeclaration" ||
						statement.type === "ExportDefaultDeclaration" ||
						statement.type === "ExportNamedDeclaration" ||
						statement.type === "ExportAllDeclaration"
				);
			if (isHarmony) {
				const module = parser.state.module;
				const compatDep = new HarmonyCompatibilityDependency();
				compatDep.loc = {
					start: {
						line: -1,
						column: 0
					},
					end: {
						line: -1,
						column: 0
					},
					index: -3
				};
				module.addPresentationalDependency(compatDep);
				DynamicExports.bailout(parser.state);
				HarmonyExports.enable(parser.state, isStrictHarmony);
				parser.scope.isStrict = true;
			}
		});

		parser.hooks.topLevelAwait.tap("HarmonyDetectionParserPlugin", expr => {
			const module = parser.state.module;
			if (!this.topLevelAwait) {
				throw new Error(
					"The top-level-await experiment is not enabled (set experiments.topLevelAwait: true to enabled it)"
				);
			}
			if (!HarmonyExports.isEnabled(parser.state)) {
				throw new Error(
					"Top-level-await is only supported in EcmaScript Modules"
				);
			}
			if (runtimeTemplate.supportsAsyncFunction() === false) {
				const warning = new WebpackError(
					"Output environment does not support async/await"
				);
				warning.details =
					"Please set target that supports async/await or set output.environment.asyncFunction=true";
				warning.loc = expr.loc;
				module.addWarning(warning);
			}
			module.buildMeta.async = true;
		});

		const skipInHarmony = () => {
			if (HarmonyExports.isEnabled(parser.state)) {
				return true;
			}
		};

		const nullInHarmony = () => {
			if (HarmonyExports.isEnabled(parser.state)) {
				return null;
			}
		};

		const nonHarmonyIdentifiers = ["define", "exports"];
		for (const identifier of nonHarmonyIdentifiers) {
			parser.hooks.evaluateTypeof
				.for(identifier)
				.tap("HarmonyDetectionParserPlugin", nullInHarmony);
			parser.hooks.typeof
				.for(identifier)
				.tap("HarmonyDetectionParserPlugin", skipInHarmony);
			parser.hooks.evaluate
				.for(identifier)
				.tap("HarmonyDetectionParserPlugin", nullInHarmony);
			parser.hooks.expression
				.for(identifier)
				.tap("HarmonyDetectionParserPlugin", skipInHarmony);
			parser.hooks.call
				.for(identifier)
				.tap("HarmonyDetectionParserPlugin", skipInHarmony);
		}
	}
};
