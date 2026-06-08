# Capacidades de Zenith CLI

Este documento esta pensado para pegarse en cualquier chat, hilo de planeacion o conversacion tecnica cuando alguien necesita decidir si Zenith encaja con un proyecto.

## Resumen Corto

Zenith es un CLI local-first para guiar agentes de codigo sin perder contexto. Ayuda a que humanos y agentes de IA puedan continuar trabajo entre sesiones sin depender del contexto implicito del chat. Convierte el estado local del proyecto en instrucciones compactas sobre que es el proyecto, que se esta haciendo, que cambio, que falta, que esta bloqueado, que evidencia existe y cual deberia ser el siguiente paso.

Zenith no reemplaza GitHub Issues, Linear, Jira, documentacion, ADRs, CI ni Git. Vive junto a esas herramientas y cubre un problema mas especifico: continuidad privada, trazabilidad ligera y handoff operativo para desarrollo asistido por IA.

## Objetivo Principal

El objetivo de Zenith es hacer menos fragil el desarrollo de software de larga duracion con agentes de IA.

Esta pensado para proyectos donde el trabajo se reparte entre multiples chats, agentes, ramas, dias o sesiones. En lugar de pedirle al siguiente agente "lee el repo y continua", Zenith convierte el estado local del proyecto en guia explicita e inspeccionable:

- intencion estable del proyecto
- direccion de roadmap
- planes ejecutables por fases
- evidencia de trabajo listo, terminado o bloqueado
- decisiones tecnicas y sus razones
- findings, riesgos, bugs, deuda y bloqueos
- checkpoints de sesion
- anclas a documentacion relevante
- estado de handoff entre agentes
- reportes de frescura, drift, actividad, readiness y ROI de contexto

El ciclo ideal es: retomar contexto, elegir el siguiente paso, trabajar, verificar, guardar evidencia y hacer handoff limpio.

## Cuando Si Encaja

Zenith encaja bien cuando un proyecto tiene una o mas de estas condiciones:

- Se usan agentes de codigo con frecuencia.
- El trabajo dura mas de una conversacion o sesion.
- Se quiere contexto privado local en lugar de depender de contexto guardado en un SaaS.
- Hay que dividir trabajo en planes, fases y dependencias.
- Importa separar `needs_review` de `done`.
- El equipo necesita un resumen compacto de "donde estamos y que sigue".
- La documentacion del repo importa, pero no se quiere copiar documentos completos al contexto.
- Se quiere trazabilidad ligera para decisiones, findings, evidencia y sesiones.
- Varios agentes locales pueden trabajar en paralelo y necesitan dispatch por fases, claims, stage, watch o focus.
- Se quiere detectar worktrees sucios, evidencia debil, docs stale, tags ambiguos o readiness bajo antes de continuar.

## Cuando No Encaja

Zenith probablemente no debe ser la herramienta principal si el proyecto necesita:

- un issue tracker publico
- gestion remota de tareas para un equipo completo
- reemplazar GitHub, Linear, Jira o ADRs
- sincronizacion cloud por defecto
- orquestar y lanzar automaticamente CLIs de proveedores de IA
- almacenar transcripciones completas, diffs completos, logs, credenciales o datos privados crudos
- un archivo de cumplimiento legal o auditoria inmutable
- CI/CD completo

Puede complementar esas herramientas, pero su alcance intencional es mas estrecho: guia local de continuidad y coordinacion.

## Conceptos Centrales

- `brief`: intencion estable del proyecto y por que existe.
- `roadmap`: direccion de largo plazo, milestones o lineas de capacidad.
- `plan`: trabajo ejecutable que se esta haciendo ahora.
- `phase`: una fase de un plan, con estado, criterios de aceptacion, dependencias y evidencia.
- `spike`: investigacion acotada para reducir incertidumbre.
- `decision`: decision tecnica o estrategica con contexto y consecuencias.
- `finding`: bug, riesgo, deuda, bloqueo o gap.
- `session`: registro de continuidad de una sesion o checkpoint.
- `context_doc`: ancla de documentacion pineada o ignorada.
- `tag`: etiqueta normalizada para descubrimiento deterministico.
- `claim`: lease local para coordinar quien trabaja en un scope.
- `dispatchable`: fase lista para implementacion o review que puede entregarse a un agente.
- `evidence`: prueba normalizada asociada a un registro de contexto, por ejemplo commits, archivos, comandos, tests, links, issues, PRs, ADRs o ramas.
- `lifecycle`: proyeccion comun de estado, como active, done, blocked, stale, superseded o archived.

## Capacidades Principales

### 1. Continuidad De Trabajo

Zenith puede generar un briefing compacto para retomar trabajo:

```bash
zenith continue
zenith continue --compact
zenith context compact --json
```

Ese briefing responde:

- donde esta parado el proyecto
- que cambio en la ultima sesion
- que falta
- cual es el siguiente paso
- que riesgos o bloqueos existen
- si el contexto esta stale
- si el worktree esta sucio
- que comandos conviene ejecutar despues

`zenith continue` es el comando principal al inicio de una sesion.

### 2. Contexto Privado Local

Zenith guarda contexto operativo en una base SQLite local bajo `ZENITH_HOME` o `~/.zenith`. El repositorio guarda codigo y docs; el contexto de Zenith queda privado y local por defecto.

Ese contexto puede incluir briefs, roadmaps, planes, spikes, decisiones, findings, sesiones, docs anchors, tags, lifecycle, evidencia, claims y eventos sanitizados.

### 3. Roadmaps, Planes Y Fases

Zenith separa direccion de largo plazo de trabajo ejecutable:

```bash
zenith roadmap create --json --input -
zenith roadmap create-plan <roadmap-id> --json --input -
zenith plan create --json --input -
zenith plan next --json
zenith plan phase show <phase-id> --json
zenith plan path <plan-id> --json
zenith plan dispatchables [plan-id] --json
zenith dispatch [plan-id] --json [--claim] [--format markdown|codex|conductor]
```

Los roadmaps describen hacia donde va el proyecto. Los planes describen trabajo que ya se puede ejecutar. Las fases pueden tener dependencias con `dependsOn`, asi que Zenith puede decir si la siguiente fase esta lista o bloqueada por otra fase.

Estados de fase:

- `todo`
- `in_progress`
- `needs_review`
- `done`
- `blocked`

`needs_review` es clave para flujos con agentes: permite marcar una implementacion como verificada y lista para review sin decir falsamente que ya esta terminada.

`plan dispatchables` y `dispatch` son el fan-out paralelo del flujo serial `plan next`. `dispatchables` lista todas las fases que se pueden ejecutar ahora, las que estan bloqueadas por dependencias, las que necesitan review y los findings bloqueantes. `dispatch` genera un handoff por fase: prompt de implementer para fases listas, prompt de reviewer para fases en `needs_review`, rama sugerida, claim sugerido, scope por fase y comandos de verificacion. Con `--claim`, Zenith crea los claims por adelantado usando scopes no solapados como `phase:<phase-id>`. Con `--format conductor`, emite bloques `Workspace N` para abrir una sesion por fase.

### 4. Ready, Done Y Blocked

Zenith tiene transiciones explicitas para trabajo listo, terminado o bloqueado:

```bash
zenith plan ready --evidence "Verification passed"
zenith plan done --evidence "Review passed"
zenith plan block --phase <phase-id> --plan <plan-id> --evidence "Blocked by missing API contract"
```

`plan ready` significa que la implementacion y verificacion estan completas, pero falta review. `plan done` significa que el trabajo ya fue revisado y esta completo. `plan block` marca un bloqueo de fase con evidencia.

### 5. Evidencia Normalizada

Zenith usa evidencia normalizada para que los cambios importantes de estado no dependan de notas genericas.

Tipos de evidencia:

- `note`
- `commit`
- `file`
- `pr`
- `issue`
- `command`
- `test`
- `link`
- `adr`
- `branch`

La evidencia puede incluir anclas opcionales como path, linea, linea final, label, fecha de verificacion, bandera stale o referencia superseded-by.

Acciones importantes requieren evidencia no generica, incluyendo trabajo listo para review, trabajo terminado, findings cerrados, fases bloqueadas y checkpoints guardados desde Git.

### 6. Decisiones Y Findings

Zenith registra decisiones y findings como contexto de primera clase:

```bash
zenith decision record "Use SQLite for local context" --context "..." --decision "..."
zenith finding record "Missing acceptance criteria" --description "..."
zenith finding close <finding-id> --evidence "Acceptance criteria added"
```

Las decisiones preservan por que se eligio algo. Los findings preservan riesgos, bugs, bloqueos o deuda hasta que se cierran con evidencia.

### 7. Checkpoints De Sesion

Zenith puede capturar continuidad ligera de sesiones:

```bash
zenith session checkpoint --from-git
zenith session checkpoint --from-git --save --summary "What changed" --next "What to do next"
zenith session checkpoint "What changed" --next "What to do next"
zenith session note "Short note"
```

`session checkpoint --from-git` es read-only a menos que se use `--save`. Puede resumir rama, commit, archivos cambiados, siguiente paso inferido y evidencia sin guardar diffs crudos.

### 8. Handoff Explicito Entre Agentes

Zenith puede generar handoffs por rol:

```bash
zenith handoff --to planner --compact
zenith handoff --to implementer --compact
zenith handoff --to reviewer --compact
zenith handoff --to implementer --compact --max-tokens 800
```

Esto le da a un planner, implementer o reviewer un prompt compacto basado en el contexto actual del proyecto.

Para renderizado de prompt de bajo nivel:

```bash
zenith agent prompt --format codex --role implementer --json
```

### 9. Coordinacion Local Y Dispatch Paralelo De Agentes

Zenith puede coordinar agentes locales sin lanzar CLIs de proveedores:

```bash
zenith plan dispatchables <plan-id> --json
zenith dispatch <plan-id> --json --claim --format conductor
zenith agent focus set <roadmap-id>
zenith agent stage set --json --input -
zenith agent watch --until stage=review,plan=<plan-id>,phase=<phase-id> --json
zenith agent claim create <phase-id> --scope phase:<phase-id> --ttl 2h --role implementer
zenith agent claim list --json
zenith agent claim refresh <claim-id> --ttl 2h
zenith agent claim release <claim-id-or-entity-id>
```

Focus vincula el worktree actual con un roadmap. Stage y watch permiten wake-on-event choreography. Claims son leases locales con TTL para que los agentes no pisen el mismo scope de trabajo.

El flujo paralelo recomendado es: el planner corre `plan dispatchables`, genera handoffs con `dispatch --format conductor`, abre una sesion por handoff, cada agente toma su claim de fase, implementa o revisa solo esa fase y marca su propio `stage=review` o avanza el plan cuando corresponde. Zenith emite el manifest y los claims, pero no lanza los agentes ni los CLIs de proveedores. La convergencia se serializa en la sesion de planificacion con `plan advance` o `plan done`.

### 10. Doctor Y Readiness

Zenith incluye un doctor read-only:

```bash
zenith doctor
zenith doctor --compact
zenith doctor --json
zenith doctor --since <event-id-or-iso>
```

Doctor revisa problemas como ramas invalidas o stale, evidencia debil, docs stale, tags ambiguos, claims expirados, criterios de aceptacion faltantes, violaciones legacy de guardrails y factores de readiness sucios.

Readiness tambien aparece en `continue`, para que el flujo normal de retomar trabajo pueda advertir sobre worktrees sucios, contexto stale, findings bloqueantes o proyectos no registrados.

### 11. Reports Y Telemetria

Zenith tiene reportes read-only:

```bash
zenith report roi
zenith report timeline
zenith report standup
zenith report diff
zenith report drift
zenith report adherence
zenith report activity
```

Estos reportes ayudan a responder:

- cuanto contexto se comprimio en un briefing
- que paso recientemente
- que cambio desde un cursor o sesion
- si los planes activos se estan desviando del roadmap
- cuanto trabajo se esta completando
- como se ve el patron de actividad

### 12. Anclas A Documentacion

Zenith puede sugerir, pinear, ignorar y listar anchors de documentacion:

```bash
zenith docs suggest --task current
zenith docs pin docs/reference.md --task current
zenith docs ignore docs/old-plan.md --task current
zenith docs list --task current
```

La meta no es copiar documentos completos a una base de notas. Zenith guarda anchors y resumenes para que los agentes sepan que docs importan para una tarea.

### 13. Search Y Tags

Zenith soporta descubrimiento deterministico de contexto:

```bash
zenith search --query "readiness"
zenith search --query "handoff" --tag area:agents
zenith tag create area:agents --description "Agent coordination work"
zenith tag alias agents area:agents
zenith tag set plan <plan-id> --json --input -
zenith tag list --unused
```

Mantiene tags libres, pero tambien soporta prefijos gobernados:

- `area:`
- `epic:`
- `risk:`
- `service:`

Los aliases ayudan a reducir tags duplicados o ambiguos.

### 14. Raw Inspect Y Purge

Zenith incluye comandos administrativos de contexto local:

```bash
zenith memory inspect raw <entity-type> <entity-id> --json
zenith memory purge entity <entity-type> <entity-id> --confirm
zenith memory purge tag <tag> --confirm
zenith memory purge project --confirm
```

Raw inspect ayuda a diagnosticar registros guardados. Purge elimina registros solo con confirmacion explicita y escribe eventos tombstone sanitizados.

### 15. Dashboard OpenTUI

Ejecutar Zenith sin comando abre un dashboard read-only desde el checkout fuente:

```bash
bun run zenith
```

El dashboard muestra readiness, ROI, siguiente accion, plan activo, findings, spikes, contexto de benchmarks, actividad, search y vistas de roadmap workspace.

### 16. Benchmarks Y Demos

Zenith incluye demos read-only y flujos de benchmark:

```bash
zenith demo list
zenith demo show continuity
zenith benchmark list
zenith benchmark task <scenario-id> --variant <variant>
zenith benchmark record --json --input -
zenith benchmark compare
```

Las demos explican como se espera usar Zenith. Los benchmarks ayudan a comparar estrategias de contexto sin guardar prompts, outputs, transcripts, secrets o diffs.

### 17. Privacidad Y Guardrails

Zenith rechaza o redacta escrituras inseguras de contexto. Esta disenado para evitar guardar:

- secrets
- private keys
- credenciales tipo token
- diffs completos
- transcripts largas
- blobs de logs
- copias de documentacion canonica
- records demasiado grandes

Codigos de error relevantes:

- `secret_detected`
- `full_diff_detected`
- `long_transcript_detected`
- `log_blob_detected`
- `canonical_doc_duplicate`
- `record_too_large`

Los eventos se sanitizan centralmente para guardar ids, estados, counts y metadata corta, no texto completo de usuarios, valores completos de evidencia, diffs, logs o secrets.

## CLI Canonico Top-Level

Zenith mantiene intencionalmente una superficie top-level pequena:

```text
init
project
continue
context
roadmap
plan
memory
session
decision
finding
docs
tag
search
doctor
handoff
agent
report
benchmark
demo
```

Las capacidades mas especificas viven bajo grupos canonicos como `memory`, `agent` y `report`.

## Loop Diario Tipico

```bash
zenith continue
zenith docs suggest --task current
zenith handoff --to implementer --compact

# Trabajar y verificar en el repo.

zenith session checkpoint --from-git
zenith plan ready --evidence "Typecheck and tests passed"

# Despues de review:
zenith plan done --evidence "Review passed"
```

Para findings:

```bash
zenith finding record "Risk title" --description "Why it matters"
zenith finding close <finding-id> --evidence "Fix verified"
```

Para coordinacion local de agentes:

```bash
zenith plan dispatchables <plan-id> --json
zenith dispatch <plan-id> --json --claim --format conductor
zenith agent claim create <phase-id> --scope phase:<phase-id> --ttl 2h --role implementer
zenith agent stage set --json --input -
zenith agent watch --until stage=review --json
zenith agent claim release <claim-id>
```

## Modelo De Integracion

Zenith expone envelopes JSON estables para scripts, tests y agentes:

```bash
zenith plan next --json
zenith plan dispatchables --json
zenith dispatch --json --format conductor
zenith context compact --json
zenith doctor --json
zenith report timeline --json
```

Cada comando JSON devuelve un envelope estable con `ok`, `data`, `warnings`, `errors` y `meta`.

## Checklist De Evaluacion

Usa este checklist para decidir si Zenith encaja con un proyecto:

- Perdemos contexto entre sesiones de agentes de IA?
- Los agentes necesitan un siguiente paso confiable en lugar de adivinar desde el repo?
- Necesitamos contexto privado local en vez de depender de contexto cloud?
- Necesitamos planes por fases con handoff a review?
- Necesitamos despachar fases independientes a varios agentes sin que sus claims se solapen?
- Nos importa exigir evidencia para estados ready, done o blocked?
- Necesitamos recordar decisiones y findings sin crear tickets pesados?
- Necesitamos prompts compactos para planner, implementer o reviewer?
- Necesitamos reportes read-only sobre drift, actividad, frescura o ROI de contexto?
- Necesitamos guardrails contra guardar secrets, diffs, logs o transcripts accidentalmente?
- Queremos complementar GitHub, Linear y docs en vez de reemplazarlos?

Si la mayoria de respuestas son si, Zenith probablemente aporta valor. Si el proyecto necesita principalmente gestion remota de tareas, issue tracking, CI automation o archivos de cumplimiento a largo plazo, Zenith deberia ser una herramienta de apoyo, no el sistema principal.

## Version De Un Parrafo

Zenith CLI es una capa local-first de guia y coordinacion para desarrollo de software asistido por IA. Guarda en SQLite privado el brief del proyecto, roadmap, planes ejecutables, fases, decisiones, findings, sesiones, docs anchors, tags, evidencia, claims y eventos sanitizados. Ayuda a una persona o agente a retomar trabajo con `zenith continue`, elegir el siguiente paso con `plan next`, hacer handoff de roles con `handoff`, despachar fases independientes con `dispatch`, coordinar agentes locales con `agent stage/watch/claim`, validar readiness con `doctor` e inspeccionar progreso con reportes read-only y un TUI. Encaja mejor en proyectos donde importan continuidad, evidencia, privacidad y handoff entre agentes, y evita convertirse en issue tracker remoto, CI system, archivo de transcripts o almacen de secrets.
