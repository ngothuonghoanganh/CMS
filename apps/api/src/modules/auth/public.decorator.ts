import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'plp:isPublic';

/** Marks a route that needs no session (signup, login, health, public delivery). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
