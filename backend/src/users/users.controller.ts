import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { users } from '../data/store';
import { AuthGuard } from '../auth/auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  @Get('me') getProfile(@Req() request: Request & { user: { id: number } }) {
    const user = users.find(item => item.id === request.user.id)!;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  @Patch('me') updateProfile(@Req() request: Request & { user: { id: number } }, @Body() dto: UpdateProfileDto) {
    const user = users.find(item => item.id === request.user.id)!;
    if (dto.name !== undefined) user.name = dto.name.trim();
    if (dto.phone !== undefined) user.phone = dto.phone.trim();
    if (dto.role !== undefined) user.role = dto.role;
    const { passwordHash, ...safeUser } = user;
    return { message: 'Profile updated successfully.', user: safeUser };
  }
}