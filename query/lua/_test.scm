(
 [
  (variable_declaration
    documentation: (lua_documentation) @func
    name: (variable_declarator (identifier) @name)) @doc

  (function_statement
    documentation: (lua_documentation) @func
    name: (function_name (identifier) @name)) @doc
  ]

 (module_return_statement (identifier) @exported)
 (#eq? @exported @name))
