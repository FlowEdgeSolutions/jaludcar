# FlowedgeApp

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.3.7.

## Development server

To start a local development server, run:

```bash
npm run dev
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Railway deployment

This frontend is configured for Angular SSR on Railway.

1. Create a Railway service from this repository.
2. Set the service Root Directory to `/frontend`.
3. Railway can then use the default Node flow:
   - install: `npm install`
   - build: `npm run build`
   - start: `npm start`

`npm start` runs the production SSR server from `dist/flowedge-app/server/server.mjs` and binds to Railway's `PORT` environment variable via `src/server.ts`.

Recommended:

- Use Node 20 on Railway.
- Keep the API on its own domain, because the production frontend already points to `https://api.jalud.de/api` in `src/environments/environment.prod.ts`.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
