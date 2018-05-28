import { schema, TypeOf } from '../../config/schema';

import { assertNever } from '../../../utils';
import { Env } from '../../config';
import { LegacyAppender } from '../../legacy_compat/logging/appenders/legacy_appender';
import { Layouts } from '../layouts/layouts';
import { LogRecord } from '../log_record';
import { ConsoleAppender } from './console/console_appender';
import { FileAppender } from './file/file_appender';

const appendersSchema = schema.oneOf([
  ConsoleAppender.configSchema,
  FileAppender.configSchema,
  LegacyAppender.configSchema,
]);

/** @internal */
export type AppenderConfigType = TypeOf<typeof appendersSchema>;

/**
 * Entity that can append `LogRecord` instances to file, stdout, memory or whatever
 * is implemented internally. It's supposed to be used by `Logger`.
 * @internal
 */
export interface Appender {
  append(record: LogRecord): void;
}

/**
 * This interface should be additionally implemented by the `Appender`'s if they are supposed
 * to be properly disposed. It's intentionally separated from `Appender` interface so that `Logger`
 * that interacts with `Appender` doesn't have control over appender lifetime.
 * @internal
 */
export interface DisposableAppender extends Appender {
  dispose: () => void;
}

/** @internal */
export class Appenders {
  public static configSchema = appendersSchema;

  /**
   * Factory method that creates specific `Appender` instances based on the passed `config` parameter.
   * @param config Configuration specific to a particular `Appender` implementation.
   * @param env Current environment that is required by some appenders.
   * @returns Fully constructed `Appender` instance.
   */
  public static create(
    config: AppenderConfigType,
    env: Env
  ): DisposableAppender {
    switch (config.kind) {
      case 'console':
        return new ConsoleAppender(Layouts.create(config.layout));

      case 'file':
        return new FileAppender(Layouts.create(config.layout), config.path);

      case 'legacy-appender':
        const legacyKbnServer = env.getLegacyKbnServer();
        if (legacyKbnServer === undefined) {
          throw new Error('Legacy appender requires kbnServer.');
        }
        return new LegacyAppender(legacyKbnServer);

      default:
        return assertNever(config);
    }
  }
}
