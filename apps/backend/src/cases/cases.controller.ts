import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createCaseSchema,
  updateCaseSchema,
  uuidSchema,
  type CaseListResponse,
  type CaseResponse,
} from '@citizen-shield/validation';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { ZodParamPipe, ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CasesService } from './cases.service';

@ApiTags('Cases')
@Controller('cases')
@UseGuards(JwtAuthGuard)
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCaseSchema))
    body: {
      title: string;
      description: string;
      category: import('@citizen-shield/types').CaseCategory;
    },
  ): Promise<CaseResponse> {
    return this.cases.create(user, body);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<CaseListResponse> {
    return this.cases.findAll(user);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodParamPipe(uuidSchema)) id: string,
  ): Promise<CaseResponse> {
    return this.cases.findOne(user, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodParamPipe(uuidSchema)) id: string,
    @Body(new ZodValidationPipe(updateCaseSchema))
    body: {
      title?: string;
      description?: string;
      category?: import('@citizen-shield/types').CaseCategory;
      status?: import('@citizen-shield/types').CaseStatus;
    },
  ): Promise<CaseResponse> {
    return this.cases.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodParamPipe(uuidSchema)) id: string,
  ): Promise<{ id: string; deleted: true }> {
    return this.cases.remove(user, id);
  }
}
