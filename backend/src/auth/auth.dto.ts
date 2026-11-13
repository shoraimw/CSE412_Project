import {IsEmail,IsOptional,IsString,MinLength,MaxLength} from 'class-validator';
export class RegisterDto {@IsString()@MinLength(2)@MaxLength(80) name!:string;@IsEmail() email!:string;@IsString()@MinLength(8) password!:string;@IsOptional()@IsString()@MaxLength(24) phone?:string;}
export class LoginDto {@IsEmail() email!:string;@IsString()@MinLength(8) password!:string;}
export class RefreshDto {@IsString()@MinLength(20) refreshToken!:string;}